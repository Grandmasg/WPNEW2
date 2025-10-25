declare module '*/package.json' {
  export const version: string;
  export const name: string;
  export const description: string;
  // Add other package.json properties you might need
  
  const packageJson: {
    version: string;
    name: string;
    description: string;
    // Add other package.json properties you might need
  };
  
  export default packageJson;
}
