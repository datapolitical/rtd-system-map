#!/usr/bin/env python3
"""Real-phone opening timings on AWS Device Farm.

Opens the map with ?timing on one real device (Safari on iOS, Chrome on Android): one
first visit in a fresh session, then reloads, which come from the offline copy. After each
it saves the page's own timing readout (public/js/timing.js: window.loadTiming, the text
the Copy button gives, and window.loadTimingRaw, the page's and every file's times) and a
screenshot; once the session ends, the video and Device Farm's logs.

A fresh session is the only true first visit: run it again for another. With several --url,
only the first is a clean first visit; later ones may find files the earlier ones fetched.

Run as the account that holds the Device Farm profile:
  AWS_SHARED_CREDENTIALS_FILE=... python load_run.py --url URL --out DIR [--reloads 3]
Credentials and the driver endpoint are never printed. Device minutes are billed; the
session is stopped in a finally block.
"""
import argparse, json, os, sys, time, urllib.request
import boto3
from appium import webdriver
from appium.options.common.base import AppiumOptions


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


def readout(driver, limit=60):
    t0 = time.time()
    while time.time() - t0 < limit:
        got = driver.execute_script('return window.loadTiming ? [window.loadTiming, window.loadTimingRaw || null] : null')
        if got:
            return got
        time.sleep(0.25)
    return [None, None]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', required=True)
    ap.add_argument('--url', required=True, action='append', help='a public address with ?timing (the phones cannot reach the tailnet); repeat for several, each opened in turn in the same session')
    ap.add_argument('--reloads', type=int, default=3)
    ap.add_argument('--device-name', default='Apple iPhone 17 Pro')
    ap.add_argument('--device-os', default=None)
    ap.add_argument('--project', default='Map')
    ap.add_argument('--no-artifacts', action='store_true')
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    record = {'url': a.url, 'device': a.device_name, 'started': time.strftime('%Y-%m-%dT%H:%M:%S%z'), 'loads': []}

    df = boto3.Session(profile_name='rtd-devicefarm', region_name='us-west-2').client('devicefarm')
    project = next(p for p in df.list_projects()['projects'] if p['name'] == a.project)
    dev = pick_device(df, a.device_name, a.device_os)
    ios = dev['platform'] == 'IOS'
    record['device_os'] = dev['os']
    log('device', dev['name'], dev['os'])

    sess = df.create_remote_access_session(
        projectArn=project['arn'], deviceArn=dev['arn'], name=f'load-run {time.strftime("%m%d-%H%M")}',
        configuration={'parameters': {'appium:version': '3'}})['remoteAccessSession']
    arn = sess['arn']
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

        opts = AppiumOptions()
        opts.set_capability('platformName', 'iOS' if ios else 'Android')
        opts.set_capability('browserName', 'Safari' if ios else 'Chrome')
        opts.set_capability('appium:automationName', 'XCUITest' if ios else 'UiAutomator2')
        opts.set_capability('appium:newCommandTimeout', 240)
        driver = webdriver.Remote(s['endpoints']['remoteDriverEndpoint'], options=opts)
        driver.set_page_load_timeout(120)
        driver.set_script_timeout(60)

        n = 0
        for url in a.url:
            for i in range(1 + a.reloads):
                kind = 'first' if i == 0 else 'reload'
                if i == 0:
                    driver.get(url)
                else:
                    time.sleep(2)  # let the offline copy finish saving what the last load fetched
                    driver.refresh()
                text, raw = readout(driver)
                driver.get_screenshot_as_file(os.path.join(a.out, f'{n:02d}-{kind}.png'))
                record['loads'].append({'n': n, 'url': url, 'kind': kind, 'text': text, 'raw': raw})
                if text:
                    with open(os.path.join(a.out, f'{n:02d}-{kind}.txt'), 'w') as f:
                        f.write(url + '\n' + text)
                ready = next((l for l in (text or '').splitlines() if l.startswith('MAP READY')), 'no readout')
                log(kind, n, url.split('.dev')[-1], ready)
                n += 1
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

    t0 = time.time()
    while time.time() - t0 < 900:
        s = df.get_remote_access_session(arn=arn)['remoteAccessSession']
        if s['status'] == 'COMPLETED':
            break
        time.sleep(15)
    record['billing_minutes'] = s.get('deviceMinutes')
    got = []
    if not a.no_artifacts:
        for kind in ('FILE', 'LOG'):
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
    log('billed', record['billing_minutes'], 'artifacts', got)


if __name__ == '__main__':
    main()
