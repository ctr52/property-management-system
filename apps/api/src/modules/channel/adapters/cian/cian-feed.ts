import { ok, type Result } from 'neverthrow';
import type { ChannelError, FeedDocument, ListingCategory, ListingInput } from '../../domain/types';

/** Экранирование текста для XML. Чистая функция. */
const escapeXml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

/** Нейтральная категория → категория формата Циан 2.0. */
const toCianCategory = (category: ListingCategory): string => {
  switch (category) {
    case 'flat_rent':
      return 'flatRent';
    case 'flat_sale':
      return 'flatSale';
    case 'house_rent':
      return 'houseRent';
  }
};

/** Код валюты Cian (нижний регистр). */
const toCianCurrency = (currency: string): string => currency.toLowerCase().replace('rub', 'rur');

const renderObject = (listing: ListingInput): string => {
  const priceMajor = listing.basePriceMinor / 100;
  const photos = listing.photos
    .map((url) => `      <PhotoSchema><FullUrl>${escapeXml(url)}</FullUrl></PhotoSchema>`)
    .join('\n');

  return [
    '    <object>',
    `      <ExternalId>${escapeXml(listing.externalId)}</ExternalId>`,
    `      <Category>${toCianCategory(listing.category)}</Category>`,
    `      <Title>${escapeXml(listing.title)}</Title>`,
    `      <Description>${escapeXml(listing.description)}</Description>`,
    `      <Address>${escapeXml(listing.address)}</Address>`,
    '      <Price>',
    `        <Value>${priceMajor}</Value>`,
    `        <Currency>${toCianCurrency(listing.currency)}</Currency>`,
    '      </Price>',
    ...(listing.rooms !== undefined ? [`      <FlatRoomsCount>${listing.rooms}</FlatRoomsCount>`] : []),
    ...(listing.areaSqm !== undefined ? [`      <TotalArea>${listing.areaSqm}</TotalArea>`] : []),
    ...(photos ? ['      <Photos>', photos, '      </Photos>'] : []),
    '    </object>',
  ].join('\n');
};

/**
 * Сборка XML-фида формата Циан 2.0 из нормализованных листингов. Чистая функция.
 * Спецификацию тегов сверяем с офиц. доками (cian.ru/xml_import/doc) при доводке.
 */
export const buildCianFeed = (listings: readonly ListingInput[]): Result<FeedDocument, ChannelError> => {
  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<feed>',
    '  <feed_version>2</feed_version>',
    ...listings.map(renderObject),
    '</feed>',
    '',
  ].join('\n');

  return ok({ contentType: 'application/xml; charset=utf-8', body });
};
