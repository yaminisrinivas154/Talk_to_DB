# Stage 1: Build the React frontend
FROM node:16 as build
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# Stage 2: Build the FastAPI backend
FROM python:3.9
WORKDIR /app
COPY --from=build /app/frontend/build ./frontend/build
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ .

EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
