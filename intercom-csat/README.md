# intercom-csat

CLI-скрипт для выгрузки CSAT по агентам из Intercom за указанный месяц.

## Установка

```bash
npm install
cp .env.example .env
# заполни .env своими данными
```

## Настройка `.env`

```
INTERCOM_TOKEN=your_intercom_access_token
AGENTS=agent1@example.com,agent2@example.com
```

- `INTERCOM_TOKEN` — Access Token из [Intercom Developer Hub](https://app.intercom.com/a/apps/_/developer-hub)
- `AGENTS` — email-адреса агентов через запятую (регистр не важен)

## Запуск

```bash
node intercom_csat.js -m 2026-05
```

Вывод идёт в stdout в формате TSV — можно напрямую вставить в таблицу.

## Пример вывода

```
Agent       Positive  Negative  Total  CSAT%
Aiah        38        4         42     90.5%
Vince       29        2         31     93.5%
TOTAL       67        6         73     91.8%
```

## Как считается CSAT%

Intercom использует пятизвёздочную шкалу оценок:

| Оценка | Значение   | Учёт в CSAT |
|--------|------------|-------------|
| 5      | Amazing    | Positive    |
| 4      | Good       | Positive    |
| 3      | Neutral    | —           |
| 2      | Bad        | Negative    |
| 1      | Terrible   | Negative    |

Нейтральные оценки (3) **не учитываются** в расчёте — это отраслевой стандарт. CSAT отражает соотношение тех, кто выразил чёткое мнение:

```
CSAT% = Positive / (Positive + Negative) × 100
```

Если бы нейтральные попадали в знаменатель, агент без единой негативной оценки, но с половиной нейтральных, получал бы 50% — что некорректно отражало бы реальное качество работы.

Скрипт выбирает разговоры, **созданные** в указанном месяце, которые на момент выгрузки уже закрыты.
