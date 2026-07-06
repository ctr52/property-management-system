/** Грубый парсер XML-фида (для песочницы — без полноценного XML-парсера). */
const count = (xml: string, re: RegExp) => xml.match(re)?.length ?? 0;
const extractAll = (xml: string, re: RegExp) =>
  [...xml.matchAll(re)].map((m) => (m[1] ?? '').trim()).filter(Boolean);

export type ParsedFeed = { count: number; titles: string[]; externalIds: string[] };

export const parseFeed = (xml: string): ParsedFeed => ({
  count: count(xml, /<object\b/gi) + count(xml, /<Ad\b/gi),
  titles: extractAll(xml, /<Title>([\s\S]*?)<\/Title>/gi).slice(0, 20),
  externalIds: extractAll(xml, /<ExternalId>([\s\S]*?)<\/ExternalId>/gi),
});
