from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import speech_recognition as sr
from sqlalchemy import create_engine, text
from pydub import AudioSegment
import os
import io
import google.generativeai as genai
from dotenv import load_dotenv

# Get the directory of the current script
script_dir = os.path.dirname(__file__)
# Construct the path to the .env file
dotenv_path = os.path.join(script_dir, '.env')
# Load the .env file from the specified path
load_dotenv(dotenv_path=dotenv_path)

app = FastAPI()

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Gemini API Configuration ---
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
model = None
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)
    # Correct model name based on the user's available models
    model = genai.GenerativeModel('gemini-pro-latest')

# --- Database Configuration ---
DB_URL = "sqlite:///./test.db"
engine = create_engine(DB_URL, connect_args={"check_same_thread": False})

# In-memory storage for the schema
db_schema = ""

# --- Pydantic Models ---
class TextQuery(BaseModel):
    query: str

# --- Core Logic ---
def process_natural_language_query(natural_language_query: str):
    """Converts natural language to SQL, executes it, and returns the result."""
    global db_schema
    if not model:
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY is not configured on the server.")
    if not db_schema:
        raise HTTPException(status_code=400, detail="Database schema not uploaded")

    try:
        # 1. Natural Language to SQL using Gemini
        prompt = f"""
        Based on the following database schema:
        ---
        {db_schema}
        ---
        Convert the following natural language query into a single, valid SQL query.
        Only return the SQL query and nothing else.

        Natural language query: "{natural_language_query}"
        """
        
        response = model.generate_content(prompt)
        sql_query = response.text.strip().replace('`', '').replace('sql', '').strip()

        # 2. Execute the SQL query
        with engine.connect() as connection:
            with connection.begin():
                result = connection.execute(text(sql_query))
                
                message = ""
                rows = []
                
                if result.returns_rows:
                    rows = [dict(row) for row in result.mappings()]
                    message = f"{len(rows)} row(s) returned."
                else:
                    message = f"Query executed successfully. {result.rowcount} row(s) affected."

        return {"query": natural_language_query, "sql_query": sql_query, "result": rows, "message": message}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"An error occurred while processing the query: {e}")


# --- API Endpoints ---
@app.post("/api/schema")
async def upload_schema(file: UploadFile = File(...)):
    """Uploads and creates the database schema."""
    global db_schema
    try:
        schema_bytes = await file.read()
        db_schema = schema_bytes.decode()
        with engine.connect() as connection:
            with connection.begin():
                # A simple way to reset the DB for the new schema
                meta = text("SELECT name FROM sqlite_master WHERE type='table'")
                for table in connection.execute(meta).fetchall():
                    connection.execute(text(f"DROP TABLE IF EXISTS {table[0]}"))
                
                for statement in db_schema.split(';'):
                    if statement.strip():
                        connection.execute(text(statement))
        return {"message": "Schema uploaded and database reset successfully"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to create database from schema: {e}")

@app.post("/api/text-query")
async def text_query(query: TextQuery):
    """Processes a query submitted as text."""
    return process_natural_language_query(query.query)

@app.post("/api/speech-query")
async def speech_query(audio_file: UploadFile = File(...)):
    """Processes a query submitted as speech."""
    if not audio_file:
        raise HTTPException(status_code=400, detail="No audio file provided")

    try:
        # Speech to Text
        audio_data = await audio_file.read()
        audio = AudioSegment.from_file(io.BytesIO(audio_data))
        wav_audio = io.BytesIO()
        audio.export(wav_audio, format="wav")
        wav_audio.seek(0)

        r = sr.Recognizer()
        with sr.AudioFile(wav_audio) as source:
            audio_record = r.record(source)
        
        natural_language_query = r.recognize_google(audio_record)
        
        # Process the transcribed text
        return process_natural_language_query(natural_language_query)

    except sr.UnknownValueError:
        raise HTTPException(status_code=400, detail="Could not understand audio")
    except sr.RequestError as e:
        raise HTTPException(status_code=500, detail=f"Speech recognition service error: {e}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"An error occurred during speech processing: {e}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
