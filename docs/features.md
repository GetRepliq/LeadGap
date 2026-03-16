# Feature Ideas for LeadGap

Here are three feature ideas that align with your project's goal of turning customer complaints into actionable lead-generation guidance. Each feature is described from a business owner's perspective and then from a software engineer's implementation perspective.

---

### 1. Direct Competitor Weakness Analysis

- **For the Business Owner:** "Don't just tell me what people in my city complain about—tell me exactly what customers are complaining about for my biggest competitor. If I know their primary weakness is 'not showing up on time' or 'leaving a mess,' I can build my entire marketing campaign around my business's reliability and cleanliness. This gives me a surgical tool to win customers directly from my rivals."
- **For the Software Engineer:**
  - **Ease of Implementation:** Medium.
  - **Plan:**
    1. **Input:** Create a simple interface in the agent to accept a competitor's name and location (e.g., "ABC Plumbing, Anytown, USA").
    2. **Data Source:** Integrate with an API that provides business review data (e.g., Google Places API). The agent would use the input to find the business and pull its latest reviews.
    3. **Analysis:** Instead of running the NLP pipeline on a broad dataset, scope it to only the reviews collected for that specific competitor.
    4. **Output:** Present the clustered complaints and service gaps identified from the competitor's data. The output would be highly targeted: "Customers of ABC Plumbing frequently complain about 'unexpected fees' (25 mentions) and 'damage to property' (12 mentions)."

## Proposed Plan of Action

The **Direct Competitor Weakness Analysis** is a high-value "surgical" tool. Instead of broad market research, it focuses on identifying the exact "chinks in the armor" of a specific rival so you can position your business as the obvious alternative.

#### **1. Surgical Intent Detection (`agent.js`)**

We need to update `classifyIntent` to recognize a new intent: `competitor_analysis`. 

- **Example Input**: *"Analyze Premier Bathroom Remodel in Austin"* or *"What are people complaining about for ABC Plumbing?"*
- **Extraction**: It needs to pull out the **Competitor Name** and **Location**.

#### **2. Targeted Data Gathering (`utils.py`)**

The current scraper is a "broad net." For this feature, we need a "harpoon":

- **Search Precision**: We will use the competitor's name + location as the exact search string.
- **Depth**: We might want to pull more reviews (e.g., 30–50) specifically for this one business to get a statistically significant sample of their failures.

#### **3. "Competitor Takedown" Prompt (`agent.js`)**

We won't just use the standard `analyzeReviews` function. We’ll create a specialized `analyzeCompetitor` prompt that focuses on:

- **Exploitable Weaknesses**: Not just "what they do wrong," but "how we can beat them at this."
- **Customer Sentiment Delta**: Identifying what customers *initially expected* vs. *where the competitor failed*.
- **Keyword Cluster**: The exact phrases customers use when they are angry (to be used in your own ad copy).

#### **4. The "Battle Card" Output**

Instead of a general summary table, we can output a **"Competitor Battle Card"** in the CLI:

- **Status**: Dominant, Vulnerable, or Declining.
- **Top 3 Exploitable Gaps**: Specific service failures.
- **The "Switch" Hook**: A 1-sentence value proposition to convince their customers to switch to you.

---

### **Questions to Brainstorm:**

1. **Selection Strategy**: If the search for a competitor returns 3 businesses with similar names, should the agent automatically pick the top one, or should it ask you to confirm?
2. **Comparison Mode**: Do we want the ability to compare two specific competitors side-by-side (e.g., *"Compare ABC Plumbing vs. XYZ Drains"*), or should we keep it focused on one at a time for now?
3. **Storage**: Should these "Battle Cards" be saved into a new section of `market_info.json` (e.g., `competitor_deep_dives`) so they can be used later for content generation?

What do you think of this "Battle Card" approach? If it sounds good, we can start by updating the intent detection logic first.

---

### 2. Automated Ad Copy & Content Generation

- **For the Business Owner:** "It's great that you've identified that my potential customers are frustrated with 'long wait times.' But what do I do with that information? I'm not a marketing expert. I want you to take the next step for me. Write the Google Ad, the Facebook post, and the website headline that I can copy and paste. Give me something ready to go."
- **For the Software Engineer:**
  - **Ease of Implementation:** Easy to Medium.
  - **Plan:**
    1. **Trigger:** After the system identifies a "Service Gap" (e.g., "Pain Point: Lack of clear communication").
    2. **Generative AI Call:** Use a Large Language Model (LLM) API. Create a series of well-structured prompts.
    3. **Prompt Engineering:**
      - **Ad Copy Prompt:** `You are a direct-response copywriter. Given the business type [plumber] and the customer pain point [lack of clear communication], generate 3 short headlines and a 200-character description for a Google Search Ad.`
      - **Landing Page Content Prompt:** `You are a landing page strategist. For a [plumber] targeting customers frustrated by [lack of clear communication], write a headline, a sub-headline, three benefits-focused bullet points, and a call-to-action.`
    4. **Output:** Present the generated text to the user in a clean, copy-and-paste format.

---

### 3. "Urgent Need" Real-Time Lead Alerts

- **For the Business Owner:** "Strategic insights are great, but I also need leads *right now*. I want to be the first person they call. I want an alert on my phone the second someone in my zip code posts online, 'My pipe just burst, I need a plumber ASAP!' That's not a 'service gap'—that's a customer with an emergency and a credit card in hand."
- **For the Software Engineer:**
  - **Ease of Implementation:** Hard (due to data access and real-time processing). This is a more advanced, high-value feature.
  - **Plan:**
    1. **Data Source:** This is the main challenge. It requires access to real-time or near-real-time data streams. Potential sources include the Twitter/X API, subreddits for local areas (e.g., r/anytown), or specialized data providers.
    2. **Keyword Monitoring:** The system would constantly scan these streams for a combination of:
      - **Service Keywords:** "plumber," "electrician," "roofer"
      - **Urgency Keywords:** "ASAP," "emergency," "now," "help," "leaking," "broken"
      - **Location Data:** Geotags on posts or location names mentioned in the text.
    3. **NLP Filtering:** A classification model would be needed to filter out noise. For example, differentiate between "I need a plumber now!" (high-intent lead) and "Does anyone have a recommendation for a good plumber for a future remodel?" (low-intent).
    4. **Alerting:** When a high-intent post is identified, trigger an immediate notification to the business owner via email, SMS (e.g., using Twilio), or a push notification.

