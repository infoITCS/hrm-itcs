// Cascading address data: Country → State/Province → City
export type AddressDataType = {
    [country: string]: {
        [state: string]: string[];
    };
};

const addressData: AddressDataType = {
    Pakistan: {
        Punjab: [
            'Lahore', 'Faisalabad', 'Rawalpindi', 'Gujranwala', 'Multan',
            'Sialkot', 'Bahawalpur', 'Sargodha', 'Sheikhupura', 'Jhang',
            'Rahim Yar Khan', 'Gujrat', 'Sahiwal', 'Okara', 'Wah Cantonment',
            'Dera Ghazi Khan', 'Kasur', 'Hafizabad', 'Chiniot', 'Kamoke',
            'Jhelum', 'Khanewal', 'Hafizabad', 'Muzaffargarh', 'Attock',
            'Mandi Bahauddin', 'Pakpattan', 'Toba Tek Singh', 'Vehari', 'Narowal',
            'Mianwali', 'Khushab', 'Layyah', 'Lodhran', 'Bahawalnagar',
            'Chakwal', 'Bhakkar', 'Nankana Sahib', 'Rajanpur'
        ],
        Sindh: [
            'Karachi', 'Hyderabad', 'Sukkur', 'Larkana', 'Nawabshah',
            'Mirpur Khas', 'Jacobabad', 'Shikarpur', 'Khairpur', 'Dadu',
            'Badin', 'Thatta', 'Matiari', 'Sanghar', 'Tharparkar',
            'Umerkot', 'Ghotki', 'Qambar Shahdadkot', 'Shahdadpur', 'Sehwan'
        ],
        'Khyber Pakhtunkhwa': [
            'Peshawar', 'Mardan', 'Mingora', 'Kohat', 'Abbottabad',
            'Mansehra', 'Charsadda', 'Nowshera', 'Dera Ismail Khan', 'Swabi',
            'Haripur', 'Buner', 'Swat', 'Dir', 'Chitral',
            'Bannu', 'Lakki Marwat', 'Karak', 'Hangu', 'Tank'
        ],
        Balochistan: [
            'Quetta', 'Turbat', 'Khuzdar', 'Hub', 'Chaman',
            'Gwadar', 'Dera Murad Jamali', 'Sibi', 'Zhob', 'Loralai',
            'Pishin', 'Mastung', 'Kalat', 'Kharan', 'Washuk'
        ],
        'Islamabad Capital Territory': ['Islamabad'],
        'Azad Jammu & Kashmir': [
            'Muzaffarabad', 'Mirpur', 'Rawalakot', 'Kotli', 'Bagh',
            'Bhimber', 'Jhelum Valley', 'Hattian Bala'
        ],
        'Gilgit-Baltistan': [
            'Gilgit', 'Skardu', 'Hunza', 'Ghanche', 'Diamer',
            'Astore', 'Shigar', 'Ghizer', 'Nagar'
        ]
    },
    'United States': {
        California: ['Los Angeles', 'San Francisco', 'San Diego', 'San Jose', 'Sacramento'],
        'New York': ['New York City', 'Buffalo', 'Rochester', 'Yonkers', 'Syracuse'],
        Texas: ['Houston', 'Dallas', 'San Antonio', 'Austin', 'Fort Worth'],
        Florida: ['Miami', 'Orlando', 'Tampa', 'Jacksonville', 'Tallahassee'],
        Illinois: ['Chicago', 'Aurora', 'Joliet', 'Naperville', 'Rockford'],
        Washington: ['Seattle', 'Spokane', 'Tacoma', 'Bellevue', 'Vancouver'],
    },
    'United Kingdom': {
        England: ['London', 'Manchester', 'Birmingham', 'Leeds', 'Sheffield', 'Bristol', 'Liverpool'],
        Scotland: ['Edinburgh', 'Glasgow', 'Aberdeen', 'Dundee', 'Inverness'],
        Wales: ['Cardiff', 'Swansea', 'Newport', 'Bangor', 'St Davids'],
        'Northern Ireland': ['Belfast', 'Derry', 'Lisburn', 'Newry', 'Armagh'],
    },
    Canada: {
        Ontario: ['Toronto', 'Ottawa', 'Mississauga', 'Hamilton', 'Brampton'],
        'British Columbia': ['Vancouver', 'Victoria', 'Kelowna', 'Abbotsford', 'Kamloops'],
        Quebec: ['Montreal', 'Quebec City', 'Laval', 'Gatineau', 'Sherbrooke'],
        Alberta: ['Calgary', 'Edmonton', 'Red Deer', 'Lethbridge', 'Medicine Hat'],
    },
    Australia: {
        'New South Wales': ['Sydney', 'Newcastle', 'Wollongong', 'Central Coast', 'Canberra'],
        Victoria: ['Melbourne', 'Geelong', 'Ballarat', 'Bendigo', 'Shepparton'],
        Queensland: ['Brisbane', 'Gold Coast', 'Sunshine Coast', 'Townsville', 'Cairns'],
        'Western Australia': ['Perth', 'Bunbury', 'Geraldton', 'Kalgoorlie', 'Albany'],
        'South Australia': ['Adelaide', 'Mount Gambier', 'Whyalla', 'Murray Bridge'],
    },
    India: {
        'Uttar Pradesh': ['Lucknow', 'Kanpur', 'Agra', 'Varanasi', 'Meerut', 'Prayagraj'],
        Maharashtra: ['Mumbai', 'Pune', 'Nagpur', 'Nashik', 'Aurangabad'],
        Karnataka: ['Bengaluru', 'Mysuru', 'Hubli', 'Mangaluru', 'Belagavi'],
        'Tamil Nadu': ['Chennai', 'Coimbatore', 'Madurai', 'Salem', 'Tiruchirappalli'],
        Delhi: ['New Delhi', 'Dwarka', 'Noida', 'Rohini', 'Janakpuri'],
    },
    'Saudi Arabia': {
        'Riyadh Region': ['Riyadh', 'Al Kharj', 'Dawadmi', 'Zulfi'],
        'Makkah Region': ['Makkah', 'Jeddah', 'Taif'],
        'Madinah Region': ['Madinah', 'Yanbu', 'Al Ula'],
        'Eastern Province': ['Dammam', 'Al Khobar', 'Dhahran', 'Jubail', 'Hafar Al Batin'],
    },
    UAE: {
        'Abu Dhabi': ['Abu Dhabi', 'Al Ain', 'Madinat Zayed'],
        Dubai: ['Dubai', 'Jebel Ali'],
        Sharjah: ['Sharjah', 'Khor Fakkan'],
        Ajman: ['Ajman'],
        'Ras Al Khaimah': ['Ras Al Khaimah'],
        Fujairah: ['Fujairah'],
        'Umm Al Quwain': ['Umm Al Quwain'],
    },
    Germany: {
        Bavaria: ['Munich', 'Nuremberg', 'Augsburg', 'Regensburg'],
        'North Rhine-Westphalia': ['Cologne', 'Dusseldorf', 'Dortmund', 'Essen', 'Bonn'],
        Berlin: ['Berlin'],
        Hamburg: ['Hamburg'],
        'Baden-Württemberg': ['Stuttgart', 'Karlsruhe', 'Mannheim', 'Freiburg'],
    },
    France: {
        'Île-de-France': ['Paris', 'Boulogne-Billancourt', 'Saint-Denis', 'Versailles'],
        'Auvergne-Rhône-Alpes': ['Lyon', 'Grenoble', 'Saint-Étienne', 'Clermont-Ferrand'],
        "Provence-Alpes-Côte d'Azur": ['Marseille', 'Nice', 'Toulon', 'Aix-en-Provence'],
    },
    Bangladesh: {
        Dhaka: ['Dhaka', 'Narayanganj', 'Gazipur', 'Manikganj'],
        Chittagong: ['Chittagong', 'Cox\'s Bazar', 'Comilla', 'Feni'],
        Rajshahi: ['Rajshahi', 'Bogura', 'Pabna', 'Natore'],
        Sylhet: ['Sylhet', 'Moulvibazar', 'Sunamganj', 'Habiganj'],
    },
    Other: {
        'Other Region': ['Other City'],
    }
};

export const getCountries = (): string[] => Object.keys(addressData);

export const getStates = (country: string): string[] =>
    country && addressData[country] ? Object.keys(addressData[country]) : [];

export const getCities = (country: string, state: string): string[] =>
    country && state && addressData[country]?.[state] ? addressData[country][state] : [];

export default addressData;
