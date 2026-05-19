# 🧪 Kafka Testing Guide — Audit Logs Service

> Kafka Broker: `localhost:9092` | Topic: `audit.events`

---

## Step 1 — Start Kafka & Zookeeper

From the directory containing your `docker-compose.yml`:
```bash
docker compose up -d
```

> ⚠️ **Note:** Use `docker compose` (with a space, V2 plugin), NOT `docker-compose` (V1 hyphen).

Verify containers are running:

```bash
docker compose ps
```

✅ Both `zookeeper` and `kafka` should show status **Up**.

---

## Step 2 — Check Kafka Broker is Reachable

```bash
nc -zv localhost 9092
```

Expected: `Connection to localhost 9092 port [tcp/*] succeeded!`

---

## Step 3 — Create the Topic

```bash
docker exec -it $(docker compose ps -q kafka) \
  kafka-topics --bootstrap-server localhost:9092 \
  --create --topic audit.events --partitions 1 --replication-factor 1
```

Verify the topic exists:

```bash
docker exec -it $(docker compose ps -q kafka) \
  kafka-topics --bootstrap-server localhost:9092 --list
```

✅ You should see `audit.events` in the list.

---

## Step 4 — Send a Test Message (Producer)

```bash
docker exec -it $(docker compose ps -q kafka) \
  kafka-console-producer --bootstrap-server localhost:9092 \
  --topic audit.events
```

Type this message and press **Enter**:

```json
{"service":"user-service","action":"USER_CREATED","userId":"test-123"}
```

Press `Ctrl+C` to exit the producer.

---

## Step 5 — Consume the Message (Consumer)

Open a **new terminal** and run:

```bash
docker exec -it $(docker compose ps -q kafka) \
  kafka-console-consumer --bootstrap-server localhost:9092 \
  --topic audit.events --from-beginning
```

✅ You should see the message from Step 4 printed here. Kafka is working!

---

## Step 6 — End-to-End Test via NestJS API & Postman

1. **Start the API Service**:
Navigate to the central Audit API repository and start it:
```bash
npm run build
npm run start:dev
```

2. **Wait for Success Logs**:
   - `[NestFactory] Starting Nest application...`
   - `[KafkaConsumerService] Kafka consumer connected and subscribed to topic: audit.events`
   - `Audit API Service is running on: http://localhost:3000`

3. **Send Postman Request**:
   - **Method**: `POST`
   - **URL**: `http://localhost:3000/api/v1/audit/log`
   - **Body (raw JSON)**:
```json
{
  "serviceName": "user-service",
  "eventAction": "USER_CREATED",
  "domain": "USER",
  "actorId": "actor-001",
  "actorType": "user",
  "targetId": "user-999",
  "targetType": "user",
  "metadata": {
    "email": "test@example.com",
    "phone": "9876543210"
  },
  "language": "en",
  "timestamp": "2026-04-27T17:00:00.000Z"
}
```

4. **Verify Kafka Processing**:
   - Check the terminal where the API is running. You should see:
   - `Received audit event from Kafka: USER_CREATED (user-service)`


---

## Step 7 — Quick Health Check

```bash
docker exec -it $(docker compose ps -q kafka) \
  kafka-broker-api-versions --bootstrap-server localhost:9092
```

- ✅ Returns API version list → **Kafka is healthy**
- ❌ Returns error → Kafka is not running or unreachable

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `Connection refused on 9092` | Run `docker-compose up -d` first |
| Topic not found | Run the create topic command in Step 3 |
| `LEADER_NOT_AVAILABLE` warning | Wait 10–15 sec — resolves on its own |
| Container keeps restarting | Run `docker-compose logs kafka` to diagnose |

### View Kafka Logs

```bash
docker compose logs kafka
docker compose logs zookeeper
```
