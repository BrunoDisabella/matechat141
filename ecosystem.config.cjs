module.exports = {
    apps: [{
        name: "matechat-server",
        script: "./src/server.ts",
        // Use tsx via node loader or simple interpreter
        interpreter: "node",
        interpreter_args: "--import tsx",
        env: {
            NODE_ENV: "production",
            PORT: 3001
        },
        watch: false,
        exp_backoff_restart_delay: 100,
        max_memory_restart: "1G"
    }]
}
