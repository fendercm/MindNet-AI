# backend/database.py
from neo4j import GraphDatabase
import os
import time


class Neo4jConnection:
    def __init__(self):
        self.driver = None
        self._connected = False

    def connect(self):
        uri      = os.getenv("NEO4J_URI",      "bolt://127.0.0.1:7687")
        user     = os.getenv("NEO4J_USER",     "neo4j")
        password = os.getenv("NEO4J_PASSWORD", "password")

        try:
            self.driver = GraphDatabase.driver(
                uri,
                auth=(user, password),
                connection_timeout=5,
                max_connection_lifetime=3600,
                encrypted=False,
            )
            self.driver.verify_connectivity()
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

    def query(self, query: str, parameters: dict = None):
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

    def close(self):
        if self.driver:
            try:
                self.driver.close()
            except Exception:
                pass
            print("🔌 Neo4j отключён")


db = Neo4jConnection()
