import axios from 'axios';

const CSC_API_BASE_URL = 'https://api.countrystatecity.in/v1';
const API_KEY = import.meta.env.VITE_CSCAPI_KEY;

if (!API_KEY) {
    const errorMsg = 'CSC API Key (VITE_CSCAPI_KEY) is missing. Location services will fail.';
    if (import.meta.env.DEV) {
        throw new Error(errorMsg);
    } else {
        console.warn(errorMsg);
    }
}

export interface CSCCountry {
    id: number;
    name: string;
    iso2: string;
}

export interface CSCState {
    id: number;
    name: string;
    iso2: string;
}

export interface CSCCity {
    id: number;
    name: string;
}

const cscClient = axios.create({
    baseURL: CSC_API_BASE_URL,
    headers: {
        'X-CSCAPI-KEY': API_KEY
    }
});

export const locationService = {
    /**
     * Get all states for a specific country
     * @param countryIso ISO2 code of the country
     */
    getStates: async (countryIso: string, signal?: AbortSignal): Promise<CSCState[]> => {
        if (!countryIso) return [];
        try {
            const response = await cscClient.get<CSCState[]>(`/countries/${countryIso}/states`, { signal });
            return response.data;
        } catch (error: any) {
            if (error.name === 'CanceledError') return []; // Silently handle cancellation
            console.error('Error fetching states:', error);
            return [];
        }
    },

    /**
     * Get all cities for a specific country and state
     * @param countryIso ISO2 code of the country
     * @param stateIso ISO2 code of the state
     */
    getCities: async (countryIso: string, stateIso: string, signal?: AbortSignal): Promise<CSCCity[]> => {
        if (!countryIso || !stateIso) return [];
        try {
            const response = await cscClient.get<CSCCity[]>(`/countries/${countryIso}/states/${stateIso}/cities`, { signal });
            return response.data;
        } catch (error: any) {
            if (error.name === 'CanceledError') return [];
            console.error('Error fetching cities:', error);
            return [];
        }
    },

    /**
     * Get all cities for a country (if skipping states)
     * @param countryIso 
     */
    getCitiesInCountry: async (countryIso: string, signal?: AbortSignal): Promise<CSCCity[]> => {
        if (!countryIso) return [];
        try {
            const response = await cscClient.get<CSCCity[]>(`/countries/${countryIso}/cities`, { signal });
            return response.data;
        } catch (error: any) {
            if (error.name === 'CanceledError') return [];
            console.error('Error fetching cities in country:', error);
            return [];
        }
    }
};
