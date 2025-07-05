"use server"

import { generateText } from "ai"
import { createOpenAI } from "@ai-sdk/openai"

interface VocabularyItem {
  id: string
  german: string
  english: string
  context: string
}

function getApiKey(clientKey?: string): string {
  const key = clientKey?.trim() || process.env.OPENAI_API_KEY?.trim() || ""

  if (!key) {
    throw new Error("missing_api_key")
  }

  return key
}

function getProvider(apiKey?: string) {
  const key = getApiKey(apiKey)
  return createOpenAI({ apiKey: key })
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

  try {
    const sourceLang = sourceLanguage === "de" ? "German" : "English"
    const targetLang = targetLanguage === "en" ? "English" : "German"

    const provider = getProvider(apiKey)
    const { text: translation } = await generateText({
      model: provider("gpt-4o"),
      prompt: `Translate the following text from ${sourceLang} to ${targetLang}. Provide ONLY the direct translation, with no additional text or explanations.

Text to translate: "${text}"

Translation:`,
      temperature: 0,
      maxTokens: 200,
    })

    const result = translation.trim().replace(/^"|"$/g, "")
    if (!result) {
      throw new Error("Empty translation received")
    }
    return result
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error("Translation error:", msg)
    if (msg.includes("current quota")) {
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
  try {
    const provider = getProvider(apiKey)

    const { text: vocabularyJson } = await generateText({
      model: provider("gpt-3.5-turbo"),
      prompt: `Extract 2-5 key German vocabulary words from this text. Focus on useful words for learning.

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
- Use infinitive form for verbs
- Skip very common words like "und", "ist", "ich"
- Focus on words that would be useful for a German learner
- Return valid JSON only, no other text

JSON:`,
      temperature: 0.2,
      maxTokens: 800,
    })

    let cleanJson = vocabularyJson.trim()
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
