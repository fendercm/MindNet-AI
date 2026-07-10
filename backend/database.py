# backend/database.py
from neo4j import GraphDatabase
import os
<<<<<<< HEAD
import socket
=======
import time
>>>>>>> 0aa12d187cd12661ddc95506dfe0b18ce5a7718e


class Neo4jConnection:
    def __init__(self):
        self.driver = None
        self._connected = False

    def connect(self):
        uri      = os.getenv("NEO4J_URI",      "bolt://127.0.0.1:7687")
        user     = os.getenv("NEO4J_USER",     "neo4j")
        password = os.getenv("NEO4J_PASSWORD", "password")

        # Явно говорим Python НЕ использовать прокси для локальных адресов
        os.environ["NO_PROXY"]  = "localhost,127.0.0.1,::1,0.0.0.0"
        os.environ["no_proxy"]  = "localhost,127.0.0.1,::1,0.0.0.0"

        # Убираем HTTP_PROXY переменные чтобы neo4j driver не подхватил
        for var in ["HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy"]:
            os.environ.pop(var, None)

        print(f"🔌 Подключаемся к Neo4j: {uri}")

        # Сначала проверим TCP соединение
        self._check_port(uri)

        try:
            self.driver = GraphDatabase.driver(
                uri,
                auth=(user, password),
                connection_timeout=5,
                max_connection_lifetime=3600,
                encrypted=False,
            )
            self.driver.verify_connectivity()
<<<<<<< HEAD
            print("✅ Neo4j подключён успешно!")

        except Exception as e:
            print(f"❌ Neo4j ошибка: {e}")
            self._print_help(uri)
            raise e
=======
            self._connected = True
            print(f"✅ Neo4j подключён: {uri}")

        except Exception as e:
            self._connected = False
            self.driver = None
            print(f"⚠️  Neo4j недоступен: {e}")
            print("   Приложение запускается без БД.")
            print("   Запусти Neo4j Desktop и перезапусти сервер.")

    def is_connected(self) -> bool:
        return self._connected

    def reconnect(self):
        if self.driver:
            try:
                self.driver.close()
            except Exception:
                pass
        self.connect()
>>>>>>> 0aa12d187cd12661ddc95506dfe0b18ce5a7718e

    def _check_port(self, uri: str):
        """Проверяет TCP доступность порта до подключения"""
        try:
            # Парсим host:port из bolt://127.0.0.1:7687
            host_port = uri.replace("bolt://", "").replace("neo4j://", "")
            host, port = host_port.split(":")
            port = int(port)

            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(3)
            result = sock.connect_ex((host, port))
            sock.close()

            if result == 0:
                print(f"✅ TCP порт {host}:{port} — доступен")
            else:
                print(f"❌ TCP порт {host}:{port} — недоступен (код {result})")
                print("   Neo4j Desktop запущен? Статус RUNNING?")

        except Exception as e:
            print(f"⚠️ Не удалось проверить порт: {e}")

    def _print_help(self, uri: str):
        print("\n" + "="*50)
        print("💡 ДИАГНОСТИКА Neo4j:")
        print(f"   URI: {uri}")
        print("   1. Neo4j Desktop → БД → статус RUNNING?")
        print("   2. PowerShell: Test-NetConnection 127.0.0.1 -Port 7687")
        print("   3. PowerShell: netstat -ano | findstr 7687")
        print("   4. VPN: Outline не должен мешать 127.0.0.1")
        print("="*50 + "\n")

    def query(self, query: str, parameters: dict = None):
<<<<<<< HEAD
        if not self.driver:
            raise Exception("Neo4j не подключён!")
        with self.driver.session() as session:
            result = session.run(query, parameters or {})
            return [record for record in result]
=======
        if not self._connected or not self.driver:
            # Попытка переподключения один раз
            self.reconnect()
            if not self._connected:
                raise Exception("База данных недоступна. Запусти Neo4j Desktop.")
        try:
            with self.driver.session() as session:
                result = session.run(query, parameters or {})
                return [record for record in result]
        except Exception as e:
            self._connected = False
            raise e
>>>>>>> 0aa12d187cd12661ddc95506dfe0b18ce5a7718e

    def close(self):
        if self.driver:
            try:
                self.driver.close()
            except Exception:
                pass
            print("🔌 Neo4j отключён")


<<<<<<< HEAD
db = Neo4jConnection()
=======
db = Neo4jConnection()
>>>>>>> 0aa12d187cd12661ddc95506dfe0b18ce5a7718e
