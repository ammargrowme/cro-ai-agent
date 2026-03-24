/**
 * Safe JSON parsing with fallback extraction.
 * Handles AI responses that may contain JSON embedded in markdown or other text.
 */
export const safeParseJSON = (text) => {
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return JSON.parse(text);
  } catch (e) {
    throw new Error("Failed to parse JSON from AI response.");
  }
};
