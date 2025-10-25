# Translation Files Directory

This directory contains translation files used for internationalization.

## File Structure

Each language has its own JSON file named with the language code:

- `en-US.json` - English (United States)
- `nl-NL.json` - Dutch (Netherlands)  
- `de-DE.json` - German (Germany)
- `fr-FR.json` - French (France)
- `es-ES.json` - Spanish (Spain)

## Testing Translations

You can use the `test-load.html` file in this directory to check if translation files are loading correctly.

## How Translation Keys Work

Translation keys in the JSON files match the dot-notation format used in the application code:

```json
{
  "nav.daily": "Daily",
  "chart.keys": "Keys",
  "chart.keysAxis": "Keystrokes"
}
```

## Adding New Language Support

To add a new language:

1. Create a new JSON file named with the language code (e.g., `it-IT.json` for Italian)
2. Copy the structure from `en-US.json`
3. Translate all values
4. Update the available languages in the `LocalizationService`
