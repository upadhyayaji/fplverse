import { recommendTransfers } from "./recommendations.mjs";
import { predictPlayerPoints } from "./predictions.mjs";
self.onmessage=({data})=>{
  try {
    const scores=Object.fromEntries(data.players.map(player=>[player.id,data.weeks.map(gameweek=>predictPlayerPoints({player,fixtures:data.fixtures,gameweek,completedGameweeks:data.completedGameweeks}))]));
    self.postMessage({result:recommendTransfers({...data,scores}),scores});
  } catch(error) { self.postMessage({error:error.message}); }
};
