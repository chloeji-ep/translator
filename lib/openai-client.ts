// Client-side OpenAI API calls for GitHub Pages deployment

interface VocabularyItem {
  id: string
  german: string
  english: string
  context: string
}

export async function translateText(
  text: string,
  sourceLanguage: string,
  targetLanguage: string,
  apiKey?: string,
): Promise<string> {
  if (!text.trim()) {
    throw new Error("No text provided for translation")
  }

  if (!apiKey?.trim()) {
    throw new Error("missing_api_key")
  }

  try {
    const sourceLang = sourceLanguage === "de" ? "German" : "English"
    const targetLang = targetLanguage === "en" ? "English" : "German"

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          {
            role: 'user',
            content: `Translate the following text from ${sourceLang} to ${targetLang}. Provide ONLY the direct translation, with no additional text or explanations.

Text to translate: "${text}"

Translation:`
          }
        ],
        temperature: 0,
        max_tokens: 200,
      }),
    })

    if (!response.ok) {
      const error = await response.json()
      if (response.status === 429) {
        throw new Error("quota_exceeded")
      }
      throw new Error(error.error?.message || "Translation failed")
    }

    const data = await response.json()
    const translation = data.choices?.[0]?.message?.content?.trim()

    if (!translation) {
      throw new Error("Empty translation received")
    }

    return translation.replace(/^"|"$/g, "") // Remove quotes
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error("Translation error:", msg)
    if (msg.includes("quota") || msg.includes("429")) {
      throw new Error("quota_exceeded")
    }
    throw new Error(`Translation failed: ${msg}`)
  }
}

export async function extractVocabulary(
  germanText: string,
  englishTranslation: string,
  apiKey?: string,
): Promise<VocabularyItem[]> {
  if (!apiKey?.trim()) {
    return []
  }

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'user',
            content: `Extract 3-6 key German vocabulary words from this text. Focus on words that would be highlighted for language learning.

German text: "${germanText}"
English translation: "${englishTranslation}"

Return a JSON array with this exact structure:
[
{
  "german": "das Wort",
  "english": "the word", 
  "context": "original sentence"
}
]

Rules:
- Include articles for nouns (der/die/das) 
- Include root forms (infinitive for verbs, nominative for nouns)
- Include both root word AND conjugated/declined forms when they appear
- Skip very common words like "und", "ist", "ich", "der", "die", "das" when standalone
- Focus on content words: nouns, verbs, adjectives, adverbs
- Include useful expressions and phrases
- Return valid JSON only, no other text

JSON:`
          }
        ],
        temperature: 0.1,
        max_tokens: 1000,
      }),
    })

    if (!response.ok) {
      return []
    }

    const data = await response.json()
    const vocabularyJson = data.choices?.[0]?.message?.content?.trim()

    if (!vocabularyJson) {
      return []
    }

    let cleanJson = vocabularyJson
    if (cleanJson.startsWith("```json")) {
      cleanJson = cleanJson.replace(/```json\s*/, "").replace(/```\s*$/, "")
    }
    if (cleanJson.startsWith("```")) {
      cleanJson = cleanJson.replace(/```\s*/, "").replace(/```\s*$/, "")
    }

    const vocabularyData = JSON.parse(cleanJson)

    if (!Array.isArray(vocabularyData)) {
      return []
    }

    return vocabularyData
      .map((item: any) => ({
        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
        german: item.german || "",
        english: item.english || "",
        context: item.context || germanText,
      }))
      .filter((item) => item.german && item.english)
      .slice(0, 6)
  } catch (error) {
    console.error("Vocabulary extraction error:", error)
    return []
  }
}

export async function testTranslationAPI(apiKey?: string): Promise<{ success: boolean; message: string }> {
  try {
    const testResult = await translateText("Hallo, wie geht es Ihnen?", "de", "en", apiKey)

    return {
      success: true,
      message: `API working! Test translation: "${testResult}"`,
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    if (msg.includes("quota_exceeded")) {
      throw new Error("quota_exceeded")
    }
    return {
      success: false,
      message: `API test failed: ${msg}`,
    }
  }
}
