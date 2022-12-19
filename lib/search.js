module.exports = {
     endpoint: `/search/:arg(*+)`,
     func: async ({keys, idGen}, req, res) => {
          const args = req.params.arg.split(`/`);

          const services = require('fs').readdirSync(`./func/generalSong`).filter(f => f.endsWith(`.js`)).map(f => f.slice(0, -3));

          let service = null;

          if(services.find(s => s == args[0])) {
               service = args.shift();
          }

          console.log(`Searching service ${service || `[ALL]`} for ${args.join(`/`)}`)

          require(`./findMatchingSong`).func({keys, idGen}, Object.assign({}, req, { 
               body: { 
                    service,
                    title: decodeURI(args.join(`/`)) 
               } 
          }), res)
     }
}