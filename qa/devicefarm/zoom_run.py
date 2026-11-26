#!/usr/bin/env python3
"""Real-phone zoom run on AWS Device Farm.

Opens the zoom trial cold in Safari (or Chrome on Android) on one real device,
pinches from the opening zoom up to 16 and back, and records:
  - load timings (navigation + resources) and time until the map says it's ready
  - every animation frame's time and the map's zoom during the gestures
  - a phone screenshot after each gesture
  - the session video, downloaded once the session ends

Run as the account that holds the Device Farm profile:
  AWS_SHARED_CREDENTIALS_FILE=... python zoom_run.py --out DIR [--device-name "Apple iPhone 17 Pro"]
Credentials and the driver endpoint are never printed.
"""
import argparse, json, os, sys, time, urllib.request
import boto3
from appium import webdriver
from appium.options.common.base import AppiumOptions
from selenium.webdriver.common.actions import interaction
from selenium.webdriver.common.actions.action_builder import ActionBuilder
from selenium.webdriver.common.actions.pointer_input import PointerInput

FRAME_LOGGER = r"""
if (!window.__frameLog) {
  window.__frameLog = [];
  const tick = (t) => {
    const m = window.zoomMap;
    window.__frameLog.push([Math.round(t * 10) / 10, m ? Math.round(m.getZoom() * 1000) / 1000 : null]);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
return true;
"""

PAGE_FACTS = r"""
const nav = performance.getEntriesByType('navigation')[0];
const res = performance.getEntriesByType('resource').map(r => ({
  name: r.name.replace(location.origin, ''), start: Math.round(r.startTime), dur: Math.round(r.duration),
  bytes: r.transferSize || r.encodedBodySize || 0 }));
const paints = performance.getEntriesByType('paint').map(p => [p.name, Math.round(p.startTime)]);
return { nav: nav ? { dcl: Math.round(nav.domContentLoadedEventEnd), load: Math.round(nav.loadEventEnd),
           ttfb: Math.round(nav.responseStart) } : null,
         paints, res, ready: !!window.zoomReady, readyAt: window.__readyAt || null,
         state: window.zoomState || null, errors: (window.zoomErrors || []).map(String),
         timings: window.zoomTimings || [], ua: navigator.userAgent,
         viewport: [innerWidth, innerHeight, devicePixelRatio] };
"""


def log(*a):
    print(time.strftime('%H:%M:%S'), *a, flush=True)


def pick_device(df, name, os_ver):
    tok, out = None, []
    while True:
        r = df.list_devices(**({'nextToken': tok} if tok else {}))
        out += r['devices']
        tok = r.get('nextToken')
        if not tok:
            break
    hits = [d for d in out if d['name'] == name and d.get('remoteAccessEnabled')
            and (os_ver is None or d['os'] == os_ver)]
    if not hits:
        sys.exit(f'no remote-access device named {name!r} {os_ver or ""}')
    hits.sort(key=lambda d: d['os'], reverse=True)
    return hits[0]


def two_finger(driver, cx, cy, start, end, ms, steps=8):
    """Pinch on the screen (native points): fingers move apart (end > start) or together."""
    ab = ActionBuilder(driver, mouse=PointerInput(interaction.POINTER_TOUCH, 'finger1'))
    f2 = ab.add_pointer_input(interaction.POINTER_TOUCH, 'finger2')
    for src, sign in ((ab.pointer_inputs[0], -1), (f2, 1)):
        pt = lambda d: (int(cx + sign * d * 0.7), int(cy + sign * d * 0.7))
        x, y = pt(start)
        src.create_pointer_move(duration=0, x=x, y=y, origin='viewport')
        src.create_pointer_down(button=0)
        src.create_pause(0.05)
        for i in range(1, steps + 1):
            x, y = pt(start + (end - start) * i / steps)
            src.create_pointer_move(duration=int(ms / steps), x=x, y=y, origin='viewport')
        src.create_pointer_up(button=0)
    ab.perform()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', required=True)
    ap.add_argument('--url', default='https://rtd-zoom-test.chrisfnicholson.com/zoom/')
    ap.add_argument('--device-name', default='Apple iPhone 17 Pro')
    ap.add_argument('--device-os', default=None)
    ap.add_argument('--project', default='Map')
    ap.add_argument('--target', type=float, default=16.0)
    ap.add_argument('--gesture-ms', type=int, default=600)
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    record = {'url': a.url, 'device': a.device_name, 'started': time.strftime('%Y-%m-%dT%H:%M:%S%z'), 'steps': []}

    df = boto3.Session(profile_name='rtd-devicefarm', region_name='us-west-2').client('devicefarm')
    project = next(p for p in df.list_projects()['projects'] if p['name'] == a.project)
    dev = pick_device(df, a.device_name, a.device_os)
    ios = dev['platform'] == 'IOS'
    record['device_os'] = dev['os']
    log('device', dev['name'], dev['os'])

    sess = df.create_remote_access_session(
        projectArn=project['arn'], deviceArn=dev['arn'], name=f'zoom-run {time.strftime("%m%d-%H%M")}',
        configuration={'parameters': {'appium:version': '3'}})['remoteAccessSession']
    arn = sess['arn']
    record['session_arn'] = arn
    driver = None
    try:
        t0 = time.time()
        while True:
            s = df.get_remote_access_session(arn=arn)['remoteAccessSession']
            if s['status'] == 'RUNNING' and s.get('endpoints', {}).get('remoteDriverEndpoint'):
                break
            if s['status'] in ('COMPLETED', 'STOPPING') or s.get('result') in ('ERRORED', 'FAILED'):
                raise RuntimeError(f"session ended before running: {s['status']} {s.get('result')} {s.get('message', '')}")
            if time.time() - t0 > 900:
                raise RuntimeError('device not ready after 15 min')
            time.sleep(10)
        log('session running after', int(time.time() - t0), 's')
        endpoint = s['endpoints']['remoteDriverEndpoint']

        opts = AppiumOptions()
        opts.set_capability('platformName', 'iOS' if ios else 'Android')
        opts.set_capability('browserName', 'Safari' if ios else 'Chrome')
        opts.set_capability('appium:automationName', 'XCUITest' if ios else 'UiAutomator2')
        opts.set_capability('appium:newCommandTimeout', 240)
        driver = webdriver.Remote(endpoint, options=opts)
        driver.set_page_load_timeout(180)
        driver.set_script_timeout(60)

        # cold load
        t_load = time.time()
        driver.get(a.url)
        record['get_returned_s'] = round(time.time() - t_load, 2)
        while not driver.execute_script('return !!window.zoomReady'):
            if time.time() - t_load > 180:
                raise RuntimeError('map never said ready')
            time.sleep(0.25)
        record['ready_s'] = round(time.time() - t_load, 2)
        for _ in range(60):
            shown = driver.execute_script('return window.zoomShown || null')
            if shown:
                break
            time.sleep(0.25)
        record['shown_ms'] = shown
        log('ready after', record['ready_s'], 's')
        driver.execute_script(FRAME_LOGGER)
        time.sleep(1.5)

        # Pinch on the opening station: where the map draws it, in page pixels, moved by where
        # Safari's page sits on the screen.
        focus = driver.execute_script(
            "const m = window.zoomMap; const p = m.project(m.getCenter());"
            " return [p.x, p.y, innerWidth, innerHeight];")
        web_ctx = driver.current_context
        driver.switch_to.context('NATIVE_APP')
        size = driver.get_window_size()
        record['screen'] = size
        try:
            from appium.webdriver.common.appiumby import AppiumBy
            wv = driver.find_element(AppiumBy.CLASS_NAME, 'XCUIElementTypeWebView' if ios else 'android.webkit.WebView').rect
            sx, sy = wv['width'] / focus[2], wv['height'] / focus[3]
            cx, cy = wv['x'] + focus[0] * sx, wv['y'] + focus[1] * sy
            record['webview'] = wv
        except Exception as e:
            log('no webview rect, pinching mid-screen', type(e).__name__)
            cx, cy = size['width'] / 2, size['height'] / 2
        record['focus'] = [round(cx), round(cy)]
        log('pinch focus', record['focus'])

        def zoom_now():
            driver.switch_to.context(web_ctx)
            z = driver.execute_script('return window.zoomMap ? window.zoomMap.getZoom() : null')
            driver.switch_to.context('NATIVE_APP')
            return z

        def shot(name):
            driver.get_screenshot_as_file(os.path.join(a.out, f'{name}.png'))

        shot('00-ready')
        n = 0
        for phase, start, end, done in (('in', 40, 170, lambda z: z >= a.target - 0.05),
                                        ('out', 170, 40, lambda z: z <= 12.1)):
            for i in range(8):
                z0 = zoom_now()
                if done(z0):
                    break
                n += 1
                tg = time.time()
                two_finger(driver, cx, cy, start, end, a.gesture_ms)
                time.sleep(1.2)
                z1 = zoom_now()
                record['steps'].append({'n': n, 'phase': phase, 'from': z0, 'to': z1,
                                        't': round(tg - t_load, 2)})
                shot(f'{n:02d}-{phase}-{z1:.2f}')
                log(phase, n, f'{z0:.2f} -> {z1:.2f}')

        driver.switch_to.context(web_ctx)
        time.sleep(1)
        record['page'] = driver.execute_script(PAGE_FACTS)
        record['frames'] = driver.execute_script('return window.__frameLog || []')
    except Exception as e:
        record['error'] = f'{type(e).__name__}: {e}'[:2000]
        log('ERROR', record['error'])
    finally:
        if driver:
            try:
                driver.quit()
            except Exception:
                pass
        try:
            df.stop_remote_access_session(arn=arn)
        except Exception as e:
            log('stop failed', type(e).__name__)
        with open(os.path.join(a.out, 'run.json'), 'w') as f:
            json.dump(record, f, indent=1)

    # wait for the session to finish, then fetch the video and logs
    t0 = time.time()
    while time.time() - t0 < 900:
        s = df.get_remote_access_session(arn=arn)['remoteAccessSession']
        if s['status'] == 'COMPLETED':
            break
        time.sleep(15)
    record['billing_minutes'] = s.get('deviceMinutes')
    got = []
    for kind in ('FILE', 'LOG', 'SCREENSHOT'):
        tok = None
        while True:
            r = df.list_artifacts(arn=arn, type=kind, **({'nextToken': tok} if tok else {}))
            for art in r['artifacts']:
                fn = f"{kind.lower()}-{art['name']}.{art['extension']}".replace('/', '_')
                urllib.request.urlretrieve(art['url'], os.path.join(a.out, fn))
                got.append(fn)
            tok = r.get('nextToken')
            if not tok:
                break
    record['artifacts'] = got
    with open(os.path.join(a.out, 'run.json'), 'w') as f:
        json.dump(record, f, indent=1)
    log('artifacts', got)


if __name__ == '__main__':
    main()
