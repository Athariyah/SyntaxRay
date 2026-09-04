"""Пакет точки входа Vercel.

Делает `api.index` стабильно импортируемым модулем (`api.index:app`)
для entrypoint python-рантайма Vercel независимо от поддержки
namespace-пакетов (PEP 420) конкретным загрузчиком.
"""
