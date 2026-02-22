module.exports = {
    apps: [{
        name: "zeronetbank-backend",
        script: "./src/simple-server.js",
        env: {
            PORT: 3000,
            NODE_ENV: "production",
            HOST: "0.0.0.0"
        }
    }]
}
