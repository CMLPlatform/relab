// Starlight ships compiled JavaScript without the ambient type for its config
// module, which SocialIcons.astro reads directly.
declare module 'virtual:starlight/user-config' {
  const config: import('@astrojs/starlight/types').StarlightConfig;
  export default config;
}
