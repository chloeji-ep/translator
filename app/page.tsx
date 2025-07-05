"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { Settings, Mic, Volume2, Languages, AlertTriangle, BookOpen, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { useToast } from "@/hooks/use-toast"
import { translateText, testTranslationAPI, extractVocabulary } from "./actions"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetFooter } from "@/components/ui/sheet"
import { cn } from "@/lib/utils"

interface VocabularyItem {
  id: string
  german: string
  english: string
  context: string
}

interface ConversationEntry {
  id: string
  originalText: string
  translatedText: string
  timestamp: Date
  language: string
  vocabulary: VocabularyItem[]
}

const Highlight = ({ text, keywords }: { text: string; keywords: string[] }) => {
  if (!keywords?.length) {
    return <>{text}</>
  }
  const regex = new RegExp(`\\b(${keywords.join("|")})\\b`, "gi")
  const parts = text.split(regex)

  return (
    <>
      {parts.map((part, index) => {
        const isKeyword = keywords.some((kw) => kw.toLowerCase() === part.toLowerCase())
        return isKeyword ? (
          <span key={index} className="text-green-600 font-semibold">
            {part}
          </span>
        ) : (
          <span key={index}>{part}</span>
        )
      })}
    </>
  )
}

export default function TranslationApp() {
  const [isListening, setIsListening] = useState(false)
  const [conversation, setConversation] = useState<ConversationEntry[]>([])
  const [vocabulary, setVocabulary] = useState<VocabularyItem[]>([])
  const [apiKey, setApiKey] = useState<string>("")
  const [apiStatus, setApiStatus] = useState<{ success: boolean; message: string } | null>(null)
  const [liveTranscript, setLiveTranscript] = useState("")

  // --- helper: only send key if it exists ---
  const providedKey: string | undefined = apiKey.trim() ? apiKey.trim() : undefined
  const hasKey = Boolean(providedKey)

  const recognitionRef = useRef<any>(null)
  const conversationEndRef = useRef<HTMLDivElement>(null)
  const { toast } = useToast()

  // Load data from localStorage on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedConversations = localStorage.getItem("translator_conversations")
      const savedVocabulary = localStorage.getItem("translator_vocabulary")
      const savedApiKey = localStorage.getItem("OPENAI_KEY")

      if (savedConversations) {
        setConversation(
          JSON.parse(savedConversations).map((c: any) => ({
            ...c,
            timestamp: new Date(c.timestamp),
            vocabulary: Array.isArray(c.vocabulary) ? c.vocabulary : [],
          })),
        )
      }
      if (savedVocabulary) {
        setVocabulary(JSON.parse(savedVocabulary))
      }
      // Load saved API key from localStorage
      if (savedApiKey) {
        setApiKey(savedApiKey)
      }
    }
  }, [])

  // Save data to localStorage
  useEffect(() => {
    if (typeof window !== "undefined") localStorage.setItem("translator_conversations", JSON.stringify(conversation))
  }, [conversation])
  useEffect(() => {
    if (typeof window !== "undefined") localStorage.setItem("translator_vocabulary", JSON.stringify(vocabulary))
  }, [vocabulary])
  useEffect(() => {
    if (typeof window !== "undefined") localStorage.setItem("OPENAI_KEY", apiKey)
  }, [apiKey])

  // Scroll to bottom of conversation
  useEffect(() => {
    conversationEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [conversation, liveTranscript])

  // Setup Speech Recognition
  useEffect(() => {
    if (typeof window !== "undefined") {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition()
        recognition.continuous = true
        recognition.interimResults = true
        recognition.lang = "de-DE"
        recognitionRef.current = recognition
      } else {
        toast({
          title: "Speech Recognition Not Supported",
          description: "Your browser doesn't support speech recognition. Please use Chrome or Edge.",
          variant: "destructive",
        })
      }
    }
  }, [toast])

  const handleApiError = useCallback(
    (error: unknown, context: string) => {
      const msg = error instanceof Error ? error.message : String(error)
      console.error(`${context} error:`, msg)
      if (msg.includes("quota_exceeded")) {
        toast({ title: "Quota Exceeded", description: "Please add a new key in Settings.", variant: "destructive" })
      } else if (msg.includes("missing_api_key")) {
        toast({
          title: "API Key Required",
          description: "Please add your API key in Settings.",
          variant: "destructive",
        })
      } else {
        toast({
          title: `${context} Error`,
          description: `An error occurred. See console for details.`,
          variant: "destructive",
        })
      }
    },
    [toast],
  )

  const handleFinalTranscript = useCallback(
    async (text: string) => {
      if (!text.trim() || !hasKey) {
        if (!hasKey) {
          toast({
            title: "OpenAI key required",
            description: "Add your API key in Settings to enable translation.",
            variant: "destructive",
          })
        }
        return
      }

      try {
        const translatedText = await translateText(text, "de", "en", providedKey)
        const newVocab = await extractVocabulary(text, translatedText, providedKey)

        const newEntry: ConversationEntry = {
          id: Date.now().toString(),
          originalText: text,
          translatedText,
          timestamp: new Date(),
          language: "de",
          vocabulary: newVocab,
        }
        setConversation((prev) => [...prev, newEntry])

        setVocabulary((prevVocab) => {
          const existingGermanWords = new Set(prevVocab.map((v) => v.german.toLowerCase()))
          const uniqueNewVocab = newVocab.filter((v) => !existingGermanWords.has(v.german.toLowerCase()))
          return [...prevVocab, ...uniqueNewVocab]
        })
      } catch (error) {
        handleApiError(error, "Translation")
      }
    },
    [apiKey, handleApiError, providedKey, hasKey, toast],
  )

  const startListening = () => {
    if (!hasKey) {
      toast({
        title: "OpenAI key required",
        description: "Add your API key in Settings before starting live translation.",
        variant: "destructive",
      })
      return
    }
    if (!recognitionRef.current) return

    setLiveTranscript("")
    const recognition = recognitionRef.current

    recognition.onstart = () => setIsListening(true)
    recognition.onend = () => setIsListening(false)
    recognition.onerror = (event: any) => {
      console.error("Speech recognition error:", event.error)
      toast({ title: "Speech Recognition Error", description: `Error: ${event.error}`, variant: "destructive" })
    }

    recognition.onresult = (event: any) => {
      let interimTranscript = ""
      let finalTranscript = ""

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const transcript = event.results[i][0].transcript
        if (event.results[i].isFinal) {
          finalTranscript += transcript + " "
        } else {
          interimTranscript += transcript
        }
      }

      setLiveTranscript(interimTranscript)
      if (finalTranscript.trim()) {
        handleFinalTranscript(finalTranscript.trim())
      }
    }

    try {
      recognition.start()
    } catch (error) {
      console.error("Could not start recognition:", error)
    }
  }

  const stopListening = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop()
    }
  }

  const speakText = (text: string, language: string) => {
    if ("speechSynthesis" in window && text.trim()) {
      speechSynthesis.cancel()
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.lang = language === "de" ? "de-DE" : "en-US"
      utterance.rate = 0.9
      speechSynthesis.speak(utterance)
    }
  }

  const testAPI = async () => {
    if (!hasKey) {
      toast({
        title: "No key provided",
        description: "Enter an OpenAI key first.",
        variant: "destructive",
      })
      return
    }
    try {
      const result = await testTranslationAPI(providedKey)
      setApiStatus(result)
      toast({
        title: result.success ? "API Test Successful" : "API Test Failed",
        description: result.message,
        variant: result.success ? "default" : "destructive",
      })
    } catch (error) {
      handleApiError(error, "API Test")
    }
  }

  return (
    <div className="flex flex-col h-screen bg-background text-foreground">
      <header className="flex items-center justify-between p-4 border-b shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 bg-foreground rounded-full flex items-center justify-center">
            <Languages className="h-4 w-4 text-background" />
          </div>
          <h1 className="text-lg font-medium">German to English Translator</h1>
        </div>
        <div className="flex items-center gap-2">
          <Sheet>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="text-muted-foreground hover:text-foreground hover:bg-accent"
              >
                <BookOpen className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent className="bg-background flex flex-col">
              <SheetHeader>
                <SheetTitle>Vocabulary List</SheetTitle>
              </SheetHeader>
              {vocabulary.length > 0 ? (
                <div className="flex-1 overflow-y-auto pr-2 -mr-6">
                  <div className="space-y-4">
                    {vocabulary.map((item) => (
                      <div key={item.id} className="p-3 bg-muted rounded-lg">
                        <div className="flex justify-between items-baseline">
                          <p className="font-bold text-foreground">{item.german}</p>
                          <p className="text-sm text-muted-foreground">{item.english}</p>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1 italic">&quot;{item.context}&quot;</p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex items-center justify-center text-muted-foreground">
                  <p>Vocabulary you learn will appear here.</p>
                </div>
              )}
              <SheetFooter>
                <Button
                  onClick={() => setVocabulary([])}
                  variant="destructive"
                  className="w-full"
                  disabled={vocabulary.length === 0}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Clear Vocabulary
                </Button>
              </SheetFooter>
            </SheetContent>
          </Sheet>
          <Sheet>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="text-muted-foreground hover:text-foreground hover:bg-accent"
              >
                <Settings className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent className="bg-background">
              <SheetHeader>
                <SheetTitle>Settings</SheetTitle>
              </SheetHeader>
              <div className="py-4 space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="api-key">OpenAI API Key</Label>
                  <Input
                    id="api-key"
                    type="password"
                    placeholder="Enter your API key"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value.trim())}
                    className="bg-muted"
                  />
                  <p className="text-xs text-muted-foreground">
                    Your key is stored only in your browser&apos;s local storage.
                  </p>
                </div>
              </div>
              <SheetFooter className="mt-4">
                <Button onClick={testAPI} variant="outline" className="w-full bg-transparent">
                  Test API Connection
                </Button>
              </SheetFooter>
              {apiStatus && (
                <div
                  className={`mt-4 text-sm p-3 rounded-md flex items-start gap-2 ${apiStatus.success ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800 border border-red-200"}`}
                >
                  <AlertTriangle className="h-5 w-5 flex-shrink-0" />
                  <p>{apiStatus.message}</p>
                </div>
              )}
            </SheetContent>
          </Sheet>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-4 md:p-6">
        <div className="max-w-3xl mx-auto space-y-8">
          {conversation.map((entry) => (
            <div key={entry.id} className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-muted-foreground px-2 py-1 bg-muted rounded-md">DE</span>
                <p className="text-muted-foreground flex-1">
                  <Highlight text={entry.originalText} keywords={entry.vocabulary?.map((v) => v.german) ?? []} />
                </p>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-accent"
                  onClick={() => speakText(entry.originalText, "de")}
                >
                  <Volume2 className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex items-start gap-3 pl-4 border-l-2">
                <span className="text-xs font-semibold text-muted-foreground px-2 py-1 bg-muted rounded-md">EN</span>
                <p className="text-lg font-medium text-foreground flex-1">
                  <Highlight text={entry.translatedText} keywords={entry.vocabulary?.map((v) => v.english) ?? []} />
                </p>
              </div>
            </div>
          ))}
          {isListening && (
            <div className="space-y-3 pt-4">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-muted-foreground px-2 py-1 bg-muted rounded-md">DE</span>
                <p className="text-muted-foreground flex-1 animate-pulse">{liveTranscript || "Listening..."}</p>
              </div>
            </div>
          )}
          <div ref={conversationEndRef} />
        </div>
      </main>

      <footer className="p-4 border-t bg-background/80 backdrop-blur-sm">
        <div className="max-w-3xl mx-auto text-center">
          <button
            onClick={isListening ? stopListening : startListening}
            className={cn(
              "w-16 h-16 rounded-full transition-all duration-300 flex items-center justify-center mx-auto relative",
              isListening ? "bg-red-600 text-white" : "bg-foreground text-background",
            )}
          >
            <Mic className="h-7 w-7" />
            {isListening && <div className="absolute inset-0 rounded-full bg-red-600/50 animate-ping -z-10"></div>}
          </button>
          <p className="text-xs text-muted-foreground mt-2">
            {isListening ? "Listening for German..." : "Click to start live translation"}
          </p>
        </div>
      </footer>
    </div>
  )
}
