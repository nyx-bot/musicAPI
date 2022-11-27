const readyManager = require('../func/readyManager');
const { compareTwoStrings } = require('string-similarity')
const fs = require('fs')

module.exports = ({
    title, artist, duration, keys
}) => new Promise(async res => {
    const threads = readyManager();

    const services = fs.readdirSync(`./func/generalSong`);

    let threadNames = [], results = {
        top: {}
    };

    services.forEach(service => {
        threadNames.push(service.split(`.`).slice(0, -1).join(`.`))
        const s = threads.add(service.split(`.`).slice(0, -1).join(`.`));
        
        require(`../func/generalSong/${service}`)({
            title, artist, duration, keys
        }).then(r => {
            if(r[0] && !r[0].title && r[0][0].title) r = r[0]
            if(r.length > 0) results[service.split(`.`).slice(0, -1).join(`.`)] = r.map(result => {
                //console.log(result)
                if(artist) {
                    let lowercase = compareTwoStrings(`${title}`.toLowerCase(), result.title.toLowerCase()) + compareTwoStrings(`${artist}`.toLowerCase(), result.artists[0].toLowerCase()) * .4
                    let uppercase = compareTwoStrings(`${title}`, result.title) + compareTwoStrings(`${artist}`, result.artists[0]) * .4
                    result.similarity = lowercase > uppercase ? lowercase : uppercase
                    //console.log(`Similarity of ${title} & ${result.title} by ${artist} / ${result.artists[0]}: ${result.similarity}`)
                } else {
                    let lowercase = compareTwoStrings(`${title}`.toLowerCase(), result.title.toLowerCase() + result.artists[0].toLowerCase())
                    let uppercase = compareTwoStrings(`${title}`, result.title + result.artists[0])
                    result.similarity = lowercase > uppercase ? lowercase : uppercase
                    //console.log(`Similarity of ${title} & ${result.title}: ${result.similarity}`)
                };

                return result;
            }).sort((a, b) => a.similarity < b.similarity ? 1 : -1);
            s.finish()
        })
    });

    threads.asyncReady(...threadNames).then(() => {
        console.log(`Top results for ${artist || `-- no artist --`} ${title}: ${Object.entries(results).filter(r => r[0] != `top`).map(r => `\n| ${r[0].toUpperCase()}: ${r[1][0].artists[0]} - ${r[1][0].title} (${Math.round(r[1][0].similarity*100)}%)`).join(``)}`)
        results.top = Object.values(results).map(a => a[0]).sort((a, b) => a.similarity < b.similarity ? 1 : -1)[0]
        res(results)
    })
})