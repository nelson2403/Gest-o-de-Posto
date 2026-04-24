import socket
import time


class DSocket:
    def __init__(self):
        self.host = None
        self.s = socket.socket()
        self.port = 0

    def tcpConnect(self, host: str, port: int) -> int:
        try:
            self.host = host
            self.port = port
            self.s.settimeout(5)
            self.s.connect((host, port))
        except OSError:
            return 0
        return 1

    def tcpSend(self, command: bytes):
        try:
            try:
                self.s.settimeout(0.01)
                trash = self.s.recv(250)
                if len(trash) > 0:
                    print("trash:", trash)
            except OSError:
                time.sleep(0.01)
            self.s.settimeout(1)
            self.s.send(command)
            time.sleep(1)
            data = self.s.recv(250)
            return data
        except OSError as msg:
            return msg

    def tcpClear(self, timeout: int):
        try:
            c = 0
            while c < timeout:
                time.sleep(1)
                self.s.settimeout(1)
                self.s.recv(250)
                c += 1
            return 0
        except OSError:
            return 0

    def is_socket_closed(self) -> bool:
        try:
            data = self.tcpSend("(&S)".encode())
            if isinstance(data, bytes):
                data = data.decode()
                return not (len(data) > 5 and data.startswith("(S"))
            return True
        except Exception:
            return True
