import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function suggestHabitsForUser(birthYear: number) {
  try {
    const age = new Date().getFullYear() - birthYear;
    
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Suggest 3 modern habits for someone who is ${age} years old. 
      Focus on health, productivity, and mindfulness. 
      Provide them in a JSON format. Include a short explanation of why each habit is beneficial.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING },
              icon: { type: Type.STRING },
              desc: { type: Type.STRING },
              why: { type: Type.STRING },
              category: { type: Type.STRING }
            },
            required: ["name", "icon", "desc", "why", "category"]
          }
        }
      }
    });

    return JSON.parse(response.text || "[]");
  } catch (error: any) {
    // Check various formats of 429 errors
    const errorStr = JSON.stringify(error);
    const isRateLimit = 
      error?.status === 429 || 
      error?.code === 429 || 
      (error?.message && (error.message.includes("429") || error.message.includes("quota"))) ||
      errorStr.includes('"code":429') ||
      errorStr.includes('"status":429') ||
      errorStr.includes("RESOURCE_EXHAUSTED") ||
      errorStr.includes("quota");

    if (isRateLimit) {
      return { error: "RATE_LIMIT", message: "AI is currently resting (rate limited). Please try again in 1 minute." };
    }
    
    console.error("Gemini API Error:", error);
    return [];
  }
}
