const READING_TYPES = [
    { key: 'ac_open', label: 'AC Open', color: 'rgb(75, 192, 192)' },
    { key: 'dc_pos', label: 'DC+', color: 'rgb(255, 99, 132)' },
    { key: 'dc_neg', label: 'DC-', color: 'rgb(54, 162, 235)' },
    { key: 'ac_close', label: 'AC Close', color: 'rgb(255, 205, 86)' }
];

const AMPLIFIER_RANGES_A = [0.002, 0.02, 0.2, 2, 20, 100];

const AVAILABLE_CURRENTS = [
    { text: '1 mA', value: 0.001 }, { text: '2 mA', value: 0.002 },
    { text: '5 mA', value: 0.005 }, { text: '10 mA', value: 0.01 }, { text: '20 mA', value: 0.02 },
    { text: '50 mA', value: 0.05 }, { text: '100 mA', value: 0.1 }, { text: '200 mA', value: 0.2 },
    { text: '500 mA', value: 0.5 }, { text: '1 A', value: 1 }, { text: '1.09 A', value: 1.09 },
    { text: '2 A', value: 2 }, { text: '5 A', value: 5 }, { text: '10 A', value: 10 },
    { text: '20 A', value: 20 }, { text: '50 A', value: 50 }, { text: '100 A', value: 100 }
];

const AVAILABLE_FREQUENCIES = [
    { text: '10 Hz', value: 10 }, { text: '20 Hz', value: 20 }, { text: '40 Hz', value: 40 }, { text: '45 Hz', value: 45 },
    { text: '60 Hz', value: 60 }, { text: '65 Hz', value: 65 }, { text: '300 Hz', value: 300 }, { text: '400 Hz', value: 400 },
    { text: '500 Hz', value: 500 }, { text: '1000 Hz', value: 1000 }, { text: '3000 Hz', value: 3000 }, { text: '5000 Hz', value: 5000 },
    { text: '10000 Hz', value: 10000 }, { text: '30000 Hz', value: 30000 }
];

export { READING_TYPES, AVAILABLE_CURRENTS, AVAILABLE_FREQUENCIES, AMPLIFIER_RANGES_A }