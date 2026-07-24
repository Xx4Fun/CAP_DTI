import type { Establishment } from '../api/client';

export const fallbackEstablishments: Establishment[] = [
  {
    id: 101,
    dti_sec_number: 'SEC-CS2019-98124',
    store_name: 'Super Metro San Jose',
    owner_name: 'Metro Retail Stores Group Inc.',
    latitude: 10.7431,
    longitude: 121.9832,
    address: 'Tobias Fornier St., Brgy. 3, San Jose de Buenavista, Antique',
    recidivism_index: 0,
  },
  {
    id: 102,
    dti_sec_number: 'SEC-CS2020-41092',
    store_name: 'Gaisano Grand Mall San Jose',
    owner_name: 'Gaisano Grand Group',
    latitude: 10.7455,
    longitude: 121.9851,
    address: 'Bantayan St., Brgy. 4, San Jose de Buenavista, Antique',
    recidivism_index: 0,
  },
  {
    id: 103,
    dti_sec_number: 'SEC-CS2018-77120',
    store_name: 'Prince Town San Jose',
    owner_name: 'Prince Retail Group',
    latitude: 10.7412,
    longitude: 121.9811,
    address: 'Market Site, Brgy. 2, San Jose de Buenavista, Antique',
    recidivism_index: 1,
  },
];
