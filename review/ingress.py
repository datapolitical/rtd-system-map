"""Accept identity headers only from the root-owned local Tailscale ingress."""
import os
import threading


_table_lock = threading.Lock()


def systemd_tcp_table_fd() -> int:
    # OpenFile= opens the table in the manager's user namespace. Opening it
    # here would map every outside UID (including root) to the overflow UID.
    if (os.environ.get("LISTEN_PID") != str(os.getpid())
            or os.environ.get("LISTEN_FDS") != "1"
            or os.environ.get("LISTEN_FDNAMES") != "map-shots-tcp"):
        raise RuntimeError("Map shots requires its systemd socket table.")
    fd = 3
    os.set_inheritable(fd, False)
    return fd


def socket_owner(port_text: str, caddy_port: int, table_fd: int) -> int | None:
    try:
        port = int(port_text)
        if not 0 < port < 65536:
            return None
        client = f"0100007F:{port:04X}"
        server = f"0100007F:{caddy_port:04X}"
        # Duplicates share the file position. Serialize scans and rewind so
        # each request uses the current kernel table.
        with _table_lock, os.fdopen(os.dup(table_fd), encoding="ascii") as table:
            table.seek(0)
            next(table, None)
            for line in table:
                fields = line.split()
                # TIME_WAIT rows can report UID 0 even for unprivileged clients.
                if fields[1:4] == [client, server, "01"]:
                    return int(fields[7])
    except (OSError, ValueError, IndexError):
        return None
    return None
