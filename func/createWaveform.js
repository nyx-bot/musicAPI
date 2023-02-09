let waveforms = {};

const parseData = (obj, length) => {
    if(!length || typeof length != `number`) length = 15

    if(typeof obj == `string`) obj = JSON.parse(obj);

    let data = obj.data.map(n => n < 0 ? n * -1 : n);

    console.log(data);

    if(data.length > length) {
        let nums = [];

        for (i = 0; i < length; i++) {
            const n = Math.floor((i/length) * data.length);
            nums.push(data[n])
        };

        console.log(nums);

        const highest = Math.max(...nums);

        console.log(`Highest number in array: ${highest}; normalizing!`);

        nums = nums.map(i => Math.round((i/highest)*100))

        console.log(nums);
        
        return nums;
    }
}

module.exports = ({id, length}) => new Promise(async (res, rej) => {
    if(!waveforms[id]) {
        const spawn = require('child_process').spawn(`audiowaveform`, `--input-format opus -i - --output-format json -b 8 -z 600 -o - -q`.split(` `));
        
        const stream = require(`superagent`).get(`http://127.0.0.1:1366/stream/${id}`).set(`authorization`, require(`../config.json`).authKey)

        stream.pipe(spawn.stdin);
    
        let output = ``;
    
        spawn.stdout.on(`data`, d => {
            output = output + d.toString();
        });

        let parsed = false;

        const closeHandler = (d) => {
            if(output) {
                if(!parsed) {
                    parsed = true;
                    const d = parseData(output, length);
                    waveforms[id] = d;
                    res(waveforms[id])
                }
            } else {
                rej(`Error occurred while running.`)
                console.error(d)
            }
        }
    
        spawn.on(`error`, closeHandler)
    
        spawn.on(`close`, closeHandler);
    
        stream.on(`close`, () => {
            spawn.stdin.destroy();
        });
    } else return res(waveforms[id])
})