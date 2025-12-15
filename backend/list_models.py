import google.generativeai as genai
import os
from dotenv import load_dotenv

# Get the directory of the current script
script_dir = os.path.dirname(__file__)
# Construct the path to the .env file
dotenv_path = os.path.join(script_dir, '.env')
# Load the .env file from the specified path
load_dotenv(dotenv_path=dotenv_path)

# Configure the API key
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if not GEMINI_API_KEY:
    print("Error: GEMINI_API_KEY not found.")
else:
    genai.configure(api_key=GEMINI_API_KEY)

    print("Available models that support 'generateContent':")
    for m in genai.list_models():
      if 'generateContent' in m.supported_generation_methods:
        print(m.name)
