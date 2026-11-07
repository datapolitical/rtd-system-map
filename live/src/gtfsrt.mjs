// Decode RTD's GTFS-realtime feeds (protocol buffers) into plain objects.
//
// Only the fields the map uses are read; everything else is skipped. This is
// a hand-written reader of the protobuf wire format rather than a generated
// one, so the relay has no dependencies and the same file runs in the Worker
// and in Node's tests. Field numbers are from gtfs-realtime.proto.

// The protobuf wire format: a stream of (field number, wire type) tags, each
// followed by a varint (0), a fixed 64-bit value (1), a length-delimited
// chunk (2) or a fixed 32-bit value (5).
class Reader {
  constructor(bytes, pos = 0, end = bytes.length) {
    this.b = bytes;
    this.pos = pos;
    this.end = end;
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }

  varint() {
    let result = 0;
    let shift = 0;
    let byte;
    do {
      if (this.pos >= this.end) throw new Error('protobuf: truncated varint');
      byte = this.b[this.pos++];
      // Past 2^53 precision is lost, which no field here can reach (times
      // are seconds since 1970).
      result += shift < 28 ? (byte & 0x7f) << shift : (byte & 0x7f) * 2 ** shift;
      shift += 7;
    } while (byte & 0x80);
    return result;
  }

  bytes() {
    const len = this.varint();
    if (this.pos + len > this.end) throw new Error('protobuf: truncated field');
    const start = this.pos;
    this.pos += len;
    return [start, this.pos];
  }

  string() {
    const [start, end] = this.bytes();
    return new TextDecoder().decode(this.b.subarray(start, end));
  }

  float() {
    const v = this.view.getFloat32(this.pos, true);
    this.pos += 4;
    return v;
  }

  skip(type) {
    if (type === 0) this.varint();
    else if (type === 1) this.pos += 8;
    else if (type === 2) this.bytes();
    else if (type === 5) this.pos += 4;
    else throw new Error(`protobuf: unknown wire type ${type}`);
  }

  // Walk one message, calling `field(number, type, reader)` for each field.
  // A field the callback doesn't consume is skipped.
  each(field) {
    while (this.pos < this.end) {
      const tag = this.varint();
      const type = tag & 7;
      const before = this.pos;
      field(tag >>> 3, type, this);
      if (this.pos === before) this.skip(type);
    }
  }

  // Read an embedded message with `read(reader)`.
  message(read) {
    const [start, end] = this.bytes();
    return read(new Reader(this.b, start, end));
  }
}

const readTrip = (r) => {
  const t = {};
  r.each((n, _, rd) => {
    if (n === 1) t.trip = rd.string();
    else if (n === 5) t.route = rd.string();
    else if (n === 6) t.direction = rd.varint();
    else if (n === 2) t.start_time = rd.string();
    else if (n === 3) t.start_date = rd.string();
    else if (n === 4) t.relationship = rd.varint();
  });
  return t;
};

const readPosition = (r) => {
  const p = {};
  r.each((n, type, rd) => {
    if (type !== 5) return;
    if (n === 1) p.lat = rd.float();
    else if (n === 2) p.lon = rd.float();
    else if (n === 3) p.bearing = rd.float();
    else if (n === 5) p.speed = rd.float();
  });
  return p;
};

const readVehicleDescriptor = (r) => {
  const v = {};
  r.each((n, _, rd) => {
    if (n === 1) v.id = rd.string();
    else if (n === 2) v.label = rd.string();
  });
  return v;
};

const readVehiclePosition = (r) => {
  const v = {};
  r.each((n, _, rd) => {
    if (n === 1) v.trip = rd.message(readTrip);
    else if (n === 2) v.position = rd.message(readPosition);
    else if (n === 3) v.stop_sequence = rd.varint();
    else if (n === 4) v.status = rd.varint();
    else if (n === 5) v.timestamp = rd.varint();
    else if (n === 7) v.stop = rd.string();
    else if (n === 8) v.vehicle = rd.message(readVehicleDescriptor);
    else if (n === 9) v.occupancy = rd.varint();
  });
  return v;
};

// A TranslatedString: the English text if there is one, else the first.
const readTranslated = (r) => {
  const texts = [];
  r.each((n, _, rd) => {
    if (n !== 1) return;
    const t = {};
    rd.message((inner) =>
      inner.each((m, __, x) => {
        if (m === 1) t.text = x.string();
        else if (m === 2) t.language = x.string();
      }),
    );
    texts.push(t);
  });
  return (texts.find((t) => !t.language || t.language.startsWith('en')) ?? texts[0])?.text ?? '';
};

const readTimeRange = (r) => {
  const t = {};
  r.each((n, _, rd) => {
    if (n === 1) t.start = rd.varint();
    else if (n === 2) t.end = rd.varint();
  });
  return t;
};

const readEntitySelector = (r) => {
  const e = {};
  r.each((n, _, rd) => {
    if (n === 1) e.agency = rd.string();
    else if (n === 2) e.route = rd.string();
    else if (n === 3) e.route_type = rd.varint();
    else if (n === 4) e.trip = rd.message(readTrip).trip;
    else if (n === 5) e.stop = rd.string();
  });
  return e;
};

const readAlert = (r) => {
  const a = { periods: [], entities: [] };
  r.each((n, _, rd) => {
    if (n === 1) a.periods.push(rd.message(readTimeRange));
    else if (n === 5) a.entities.push(rd.message(readEntitySelector));
    else if (n === 6) a.cause = rd.varint();
    else if (n === 7) a.effect = rd.varint();
    else if (n === 8) a.url = rd.message(readTranslated);
    else if (n === 10) a.header = rd.message(readTranslated);
    else if (n === 11) a.description = rd.message(readTranslated);
  });
  return a;
};

const readStopTimeEvent = (r) => {
  const e = {};
  r.each((n, _, rd) => {
    if (n === 1) e.delay = rd.varint();
    else if (n === 2) e.time = rd.varint();
  });
  return e;
};

const readStopTimeUpdate = (r) => {
  const u = {};
  r.each((n, _, rd) => {
    if (n === 1) u.sequence = rd.varint();
    else if (n === 4) u.stop = rd.string();
    else if (n === 2) u.arrival = rd.message(readStopTimeEvent);
    else if (n === 3) u.departure = rd.message(readStopTimeEvent);
    else if (n === 5) u.relationship = rd.varint();
  });
  return u;
};

const readTripUpdate = (r) => {
  const u = { stops: [] };
  r.each((n, _, rd) => {
    if (n === 1) u.trip = rd.message(readTrip);
    else if (n === 3) u.vehicle = rd.message(readVehicleDescriptor);
    else if (n === 2) u.stops.push(rd.message(readStopTimeUpdate));
    else if (n === 4) u.timestamp = rd.varint();
    else if (n === 5) u.delay = rd.varint();
  });
  return u;
};

const readHeader = (r) => {
  const h = {};
  r.each((n, _, rd) => {
    if (n === 1) h.version = rd.string();
    else if (n === 2) h.incrementality = rd.varint();
    else if (n === 3) h.timestamp = rd.varint();
  });
  return h;
};

/**
 * Decode a FeedMessage. Returns `{ header, entities }`, where each entity is
 * `{ id, vehicle?, alert?, trip_update? }` with only the parts present.
 * Times are seconds since 1970, as in the feed.
 */
export function decodeFeed(bytes) {
  const feed = { header: {}, entities: [] };
  new Reader(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)).each((n, _, rd) => {
    if (n === 1) feed.header = rd.message(readHeader);
    else if (n === 2) {
      const e = {};
      rd.message((inner) =>
        inner.each((m, __, x) => {
          if (m === 1) e.id = x.string();
          else if (m === 3) e.trip_update = x.message(readTripUpdate);
          else if (m === 4) e.vehicle = x.message(readVehiclePosition);
          else if (m === 5) e.alert = x.message(readAlert);
        }),
      );
      feed.entities.push(e);
    }
  });
  return feed;
}
