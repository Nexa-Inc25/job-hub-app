module.exports = {
  style: {
    postcss: {
      plugins: [
        require('tailwindcss'),
        require('autoprefixer'),
      ],
    },
  },
  webpack: {
    configure: (webpackConfig) => {
      // Optimize chunk splitting to reduce duplicates
      webpackConfig.optimization = {
        ...webpackConfig.optimization,
        splitChunks: {
          chunks: 'all',
          cacheGroups: {
            // Vendor chunk for node_modules
            vendor: {
              test: /[\\/]node_modules[\\/]/,
              name: 'vendors',
              chunks: 'all',
              priority: 10,
            },
            // Separate chunk for MUI
            mui: {
              test: /[\\/]node_modules[\\/]@mui[\\/]/,
              name: 'mui',
              chunks: 'all',
              priority: 20,
            },
            // Common chunk for shared code
            common: {
              minChunks: 2,
              priority: 5,
              reuseExistingChunk: true,
            },
          },
        },
      };
      return webpackConfig;
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
