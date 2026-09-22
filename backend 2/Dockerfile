FROM python:3.12-slim
WORKDIR /srv
COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/app ./app
COPY backend/sample_data ./sample_data
COPY case/dataset/catalog_export_v4.csv ../case/dataset/catalog_export_v4.csv
COPY "case/dataset/Датасеты_хакатон.xlsx" "../case/dataset/Датасеты_хакатон.xlsx"
ENV ROBOSCOPE_DATABASE_URL=sqlite:////srv/data/roboscope.db
RUN mkdir -p /srv/data
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
