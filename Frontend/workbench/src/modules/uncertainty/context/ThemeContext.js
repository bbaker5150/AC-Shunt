import { createContext, useContext } from 'react';

const ThemeContext = createContext(false);

export const useTheme = () => useContext(ThemeContext);

export default ThemeContext;
