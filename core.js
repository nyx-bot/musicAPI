const core = {};

const spawnAutoRestart = (restart, time) => setTimeout(async () => {
    console.log(`fb autorestart time!`);
    restart().then(res)
}, time)

core.spawnFallback = async (autoRestart) => new Promise(async res => {
    let runningProc, pendingRestart = false;

    const restart = () => new Promise(async res => {
        if(runningProc) {
            pendingRestart = true;
            console.log(`Set pending restart to true!`);

            require('request').get(`http://127.0.0.1:1366/stopSendingPings`, {}, (e, r) => {
                console.log(`Told fallback process to stop sending pings! (${r.statusCode})`)
            });

            runningProc.once(`close`, () => {
                res()
            })
        } else {
            console.warn(`There is no running fallback process to close, returning...`)
            res(false)
        }
    })

    res({ restart, kill: () => {
        console.log(`Killing fb`)
        runningProc.kill("SIGKILL")
    } })

    while(true) await new Promise(async res => {
        pendingRestart = false;
        
        runningProc = require('child_process').spawn(`node`, [
            `server`, 
            ...process.argv.slice(2).filter(s => s != `main` && s != `debug`), 
            `--mainLocation=http://127.0.0.1:1400`, 
            `debug`
        ]);

        const procId = require('./util').idGen(8);
        runningProc.generatedID = procId;

        if(autoRestart) {
            const time = 1.8e+6
            //const time = 10000

            console.log(`Restarting fallback process in ${require('./util').time(time).string}`)
            runningProc.thisAutoRestart = spawnAutoRestart(restart, time) // restart every 30 mins
        }

        let ready = false;

        const filter = (d) => {
            d = d.toString().trim()

            blockedStrings = [
                "Checking for updates...",
                //"Did not fetch updates -- sendPings is disabled",
                "Ping sending is not enabled!"
            ]

            if(blockedStrings.indexOf(d) != -1) {
                return false
            } else return true;
        }

        const pendingRestartFunc = () => {
            //console.log(`pendingRestart timer`)
            if(runningProc.generatedID == procId && runningProc.pendingRestartTimer) {
                if(pendingRestart === true) {
                    console.log(`Pending restart was true, killing proc.`)
                    runningProc.kill("SIGINT")
                } else runningProc.pendingRestartTimer = setInterval(() => {
                    //console.log(`pendingRestart interval`)
                    if(runningProc.generatedID == procId && runningProc.pendingRestartTimer) {
                        if(pendingRestart === true) {
                            console.log(`Pending restart was true, killing proc.`)
                            runningProc.kill("SIGINT")
                        }
                    } else if(runningProc.pendingRestartTimer && runningProc.generatedID == procId) {
                        clearTimeout(runningProc.pendingRestartTimer)
                    }
                }, 1000)
            }
        };

        runningProc.pendingRestartTimer = setTimeout(pendingRestartFunc, 60000)
    
        runningProc.stdout.on(`data`, d => {
            if(!ready && d.toString().includes(`online`)) ready = true;

            if(filter(d)) {
                if(runningProc.pendingRestartTimer) clearTimeout(runningProc.pendingRestartTimer);
                runningProc.pendingRestartTimer = setTimeout(pendingRestartFunc, 20000)

                if(ready) console.log(`FB | ` + d.toString().trim().split(`\n`).join(`\nFB | `))
            }
        });

        runningProc.stderr.on(`data`, d => {
            console.error(`FB | ` + d.toString().trim().split(`\n`).join(`\nFB | `))
        });

        runningProc.on(`close`, (code, signal) => {
            console.log(`FB PROCESS CLOSED -- CODE ${code}`);
            if(runningProc.thisAutoRestart) clearTimeout(runningProc.thisAutoRestart)
            if(runningProc.pendingRestartTimer) clearTimeout(runningProc.pendingRestartTimer)
            res()
        })
    })
})

module.exports = core;