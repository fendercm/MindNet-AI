# backend/database.py
from neo4j import GraphDatabase
import os


class Neo4jConnection:
    def __init__(self):
        self.driver = None

    def connect(self):
        """Вызывается явно при старте приложения"""
        uri      = os.getenv("NEO4J_URI",      "bolt://127.0.0.1:7687")
        user     = os.getenv("NEO4J_USER",     "neo4j")
        password = os.getenv("NEO4J_PASSWORD", "password")

        try:
            self.driver = GraphDatabase.driver(
                uri,
                auth=(user, password),
                connection_timeout=10,
                max_connection_lifetime=3600,
                encrypted=False,
            )
            # Проверяем что соединение живое
            self.driver.verify_connectivity()
            print(f"✅ Neo4j подключён: {uri}")

        except Exception as e:
            print(f"❌ Neo4j ошибка подключения: {e}")
            print("💡 Проверь:")
            print("   1. Neo4j Desktop запущен (статус RUNNING)")
            print("   2. URI: bolt://127.0.0.1:7687")
            print("   3. VPN не перехватывает 127.0.0.1")
            raise e

    def query(self, query: str, parameters: dict = None):
        if not self.driver:
            raise Exception("Neo4j не подключён. Вызови connect() сначала.")
        with self.driver.session() as session:
            result = session.run(query, parameters or {})
            return [record for record in result]

    def close(self):
        if self.driver:
            self.driver.close()
            print("🔌 Neo4j отключён")


# Глобальный экземпляр — НЕ подключается сразу
# Подключение происходит в lifespan (main.py)
db = Neo4jConnection()