# syntax=docker/dockerfile:1
#
# Backend image — Java 21 / Javalin.
# Build context is the REPOSITORY ROOT (the Gradle build reads ../schemas),
# so build with: docker build -f server/Dockerfile .
#   (docker-compose.yml already sets context: . for you)

# ── Build stage ──────────────────────────────────────────────────────────────
FROM eclipse-temurin:21-jdk AS build
WORKDIR /build

# Gradle wrapper + build scripts first (better layer caching for dependencies)
COPY server/gradlew server/gradlew
COPY server/gradle server/gradle
COPY server/build.gradle.kts server/settings.gradle.kts server/
# schemas/ is bundled into resources by processResources (see server/build.gradle.kts)
COPY schemas schemas

WORKDIR /build/server
RUN chmod +x gradlew && ./gradlew --no-daemon dependencies -q || true

# Now the sources, then build a self-contained runnable distribution.
COPY server/src src
RUN ./gradlew --no-daemon -x test installDist

# ── Runtime stage ────────────────────────────────────────────────────────────
FROM eclipse-temurin:21-jre
WORKDIR /app

# installDist output: launcher under bin/, dependencies under lib/
COPY --from=build /build/server/build/install/report-design-studio-server/ /app/
# A scalardb.properties so the admin "server config" endpoint has a file to read.
# Actual DB config comes from SCALARDB_* env vars (they take priority) — see AppConfig.
COPY server/scalardb.properties.example /app/scalardb.properties

# SQLite database lives on a volume so data survives container restarts.
ENV SCALARDB_CONTACT_POINTS=jdbc:sqlite:/data/report-studio.db
ENV PORT=8080
VOLUME ["/data"]
EXPOSE 8080

CMD ["/app/bin/report-design-studio-server"]
