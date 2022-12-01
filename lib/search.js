module.exports = {
     endpoint: `/search/:arg(*+)`,
     func: async ({keys, idGen}, req, res) => {
          let q = decodeURI(req.params.arg);

          console.log(q)

          req.body = {
               title: q
          };

          require(`./findMatchingSong`).func({keys, idGen}, req, res)
     }
}