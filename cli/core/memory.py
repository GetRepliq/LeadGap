import os
import sys
import json
import google.generativeai as genai
from dotenv import load_dotenv
from pathlib import Path
import traceback

# Search for .env in parent directories
script_dir = Path(__file__).parent.resolve()
env_path = None
# Check script dir, cli dir, and project root
for p in [script_dir, script_dir.parent, script_dir.parent.parent]:
    if (p / ".env").exists():
        env_path = p / ".env"
        break

if env_path:
    print(f"Loading environment from: {env_path}")
    load_dotenv(dotenv_path=env_path)
else:
    # Fallback to default load_dotenv
    load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if not GEMINI_API_KEY:
    # Print available env keys for debugging (masked for security)
    available_keys = [k if not k.endswith('_KEY') and not k.endswith('_SECRET') else f"{k[:3]}..." for k in os.environ.keys()]
    print(f"Error: GEMINI_API_KEY not found in environment. Available keys: {available_keys}")
    sys.exit(1)

genai.configure(api_key=GEMINI_API_KEY)

def generate_cache(analysis_data, query):
    """
    Uses Gemini to synthesize the raw analysis into a structured cache template.
    """
    print(f"Generating cache for query: {query}")
    try:
        model = genai.GenerativeModel('gemini-1.5-flash-latest', generation_config={"response_mime_type": "application/json"})
        
        prompt = f"""
        You are an expert market intelligence analyst. Your task is to synthesize the following raw business analysis data into a structured market research cache.
        
        The user's original query was: "{query}"
        
        Raw Analysis Data:
        {json.dumps(analysis_data, indent=2)}
        
        Synthesize this into the following JSON template for maximum information retention and future reuse by an AI agent. Focus on "distilling" the intelligence.
        
        Template:
        {{
          "project": {{
            "niche": "Detailed niche name",
            "location": "Geographic area if applicable",
            "last_updated": "ISO timestamp",
            "total_businesses_analyzed": "number"
          }},
          "market_intelligence": {{
            "summary": "High-level synthesis",
            "core_pain_points": [
              {{
                "issue": "Specific pain point",
                "intensity": "low|medium|high",
                "evidence": "Briefly why this was identified",
                "context": "Deeper context"
              }}
            ],
            "unmet_demands": ["List of gaps identified"]
          }},
          "competitor_matrix": [
            {{
              "name": "Competitor",
              "weaknesses": ["points"],
              "strengths": ["points"],
              "sentiment_trends": "brief summary"
            }}
          ],
          "opportunity_gaps": [
            {{
              "gap_id": "gap_N",
              "description": "The gap",
              "proposed_solution": "Actionable idea",
              "estimated_value": "high|medium|low"
            }}
          ],
          "generated_assets": {{
            "value_propositions": ["Unique selling points based on gaps"],
            "ad_copy_snippets": {{
              "search_ads": [{{ "headline": "...", "description": "..." }}]
            }}
          }}
        }}
        
        Return ONLY the raw JSON object.
        """
        
        response = model.generate_content(prompt)
        return json.loads(response.text)
    except Exception as e:
        print(f"Error generating cache with Gemini: {e}")
        traceback.print_exc()
        return None

def main():
    # Read input from stdin (safer for large JSON strings)
    try:
        print("Reading input from stdin...")
        input_data = sys.stdin.read()
        if not input_data:
            print("No input data provided via stdin.")
            return

        # Expected format: JSON with "analysis" and "query"
        payload = json.loads(input_data)
        analysis_data = payload.get("analysis")
        query = payload.get("query", "Unknown Query")

        if not analysis_data:
            print("No analysis data found in payload.")
            return

        # Generate the synthesized cache
        new_cache = generate_cache(analysis_data, query)
        if not new_cache:
            print("Failed to generate cache (Gemini returned None).")
            return

        # Path to the cache file
        data_dir = Path(__file__).parent.parent / "data"
        cache_file = data_dir / "market_info.json"

        # Ensure directory exists
        print(f"Ensuring directory exists: {data_dir}")
        data_dir.mkdir(parents=True, exist_ok=True)

        # Write to file (for now, we'll just overwrite or you can implement merging logic)
        print(f"Writing to cache file: {cache_file}")
        with open(cache_file, "w") as f:
            json.dump(new_cache, f, indent=2)

        print(f"Successfully updated cache at {cache_file}")

    except json.JSONDecodeError as e:
        print(f"Error decoding JSON input: {e}")
        traceback.print_exc()
    except Exception as e:
        print(f"An error occurred in memory.py: {e}")
        traceback.print_exc()

if __name__ == "__main__":
    main()

