FROM python:3.12-alpine
WORKDIR /app
COPY server.py index.html ./
COPY css ./css
COPY js ./js
RUN mkdir -p data
EXPOSE 8080
CMD ["python3", "server.py", "--host", "0.0.0.0", "--port", "8080"]
