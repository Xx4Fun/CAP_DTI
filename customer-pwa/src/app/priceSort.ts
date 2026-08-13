export type PriceSortOption = 'default' | 'price_low' | 'price_high' | 'name';

export const PRICE_SORT_OPTIONS: ReadonlyArray<{
  value: PriceSortOption;
  label: string;
}> = [
  { value: 'default', label: 'Default order' },
  { value: 'price_low', label: 'Price: Low to High' },
  { value: 'price_high', label: 'Price: High to Low' },
  { value: 'name', label: 'Name: A–Z' },
];
