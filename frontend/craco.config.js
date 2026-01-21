module.exports = {
  style: {
    postcss: {
      plugins: [
        require('tailwindcss'),
        require('autoprefixer'),
      ],
    },
  },
  devServer: (devServerConfig) => {
    const allowedHostsEnv = process.env.ALLOWED_HOSTS;
    
    // If no env var set, allow all hosts
    if (!allowedHostsEnv) {
      return {
        ...devServerConfig,
        allowedHosts: 'all'
      };
    }
    
    // Parse comma-separated hosts
    const allowedHosts = allowedHostsEnv
      .split(',')
      .map((host) => host.trim())
      .filter(Boolean);
    
    // If parsed array is empty, allow all hosts
    return {
      ...devServerConfig,
      allowedHosts: allowedHosts.length === 0 ? 'all' : allowedHosts
    };
  }
};
