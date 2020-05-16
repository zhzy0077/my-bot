const replacements: [RegExp, string][] = [
  [/\*/g, "\\*"],
  [/#/g, "\\#"],
  [/\//g, "\\/"],
  [/\(/g, "\\("],
  [/\)/g, "\\)"],
  [/\[/g, "\\["],
  [/]/g, "\\]"],
  [/</g, "\\<"],
  [/>/g, "\\>"],
  [/~/g, "\\~"],
  [/`/g, "\\`"],
  [/\+/g, "\\+"],
  [/-/g, "\\-"],
  [/=/g, "\\="],
  [/\|/g, "\\|"],
  [/{/g, "\\{"],
  [/}/g, "\\}"],
  [/\./g, "\\."],
  [/!/g, "\\!"],
  [/_/g, "\\_"],
  [/\./g, "\\."],
];

export function escape(input: string) {
  return replacements.reduce(function(string, replacement) {
    return string.replace(replacement[0], replacement[1]);
  }, input);
}
