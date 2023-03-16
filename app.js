const express = require('express');
const WebSocket = require('ws');
const fs = require('fs');


// create a new WebSocket server on port 5000
const app = express()
const wss = new WebSocket.Server({ port: 5050 });

// create a new deck of cards
const suits = ['hearts', 'diamonds', 'clubs', 'spades'];
const values = ['ace', '2', '3', '4', '5', '6', '7', 'jack', 'queen', 'king'];
const deck = [];
for (let suit of suits) {
  for (let value of values) {
    deck.push({ suit, value });
  }
}

// shuffle the deck
const ShuffleDeck = () => {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
}

// create an array to hold connected clients
let players = [];
let scores = { team1: 0, team2: 0 }
let roundPlayerCounter = 0
let rounds = []
let puxado = 'none'
let round_winner = {}
let currentRound = []
let highest = {}
let trump = ''


// when a client connects, add them to the clients array and send them the deck of cards
wss.on('connection', (ws) => {
  console.log('Client connected');
  let nick
  let owner = false

  ws.on('message', (msg) => {
    const data = JSON.parse(msg)
    console.log(`Received ${data.type}`)
    switch (data.type) {
      case 'join':
        const playerAlreadyExists = players.some(obj => obj.nick === data.nick)

        if (players.length < 4 && playerAlreadyExists) return ws.send(JSON.stringify({ type: 'playerExists', msg: 'There already is a player with this nickname. Please try with a different one' }))
        if (players.length < 4 && !playerAlreadyExists) {

          console.log(`User ${data.nick} has joined the room`)
          nick = data.nick
          if (players.length === 0) owner = true

          const new_player = { ws: ws, nick, owner, team: 0, turn: false, cards: [], played_card: { suit: 'none', value: 'none' } }
          const player_client = { nick, owner, team: 0, turn: false, cards: [], played_card: { suit: 'none', value: 'none' } }
          players.push(new_player)

          const playerNicks = getPlayerNicks()
          broadCastMessage(JSON.stringify({ type: 'updatePlayers', players: playerNicks }))

          ws.send(JSON.stringify({ type: 'join-acc', msg: 'joined room succesfully', player: player_client }))
        } else {
          ws.send(JSON.stringify({ type: 'maxCap', msg: 'Max number of players' }))
        }
        break

      case 'join_team':
        nick = data.nick
        console.log(data.team)

        players.map((player) => {
          if (player.nick === nick) {
            player.team = data.team
          }
        })
        const playerNicks = getPlayerNicks()
        broadCastMessage(JSON.stringify({ type: 'updatePlayers', players: playerNicks }))
        break

      case 'start_game':
        console.log('game started')
        players[0].turn = true
        const playerNicksStart = getPlayerNicks()
        scores = { team1: 0, team2: 0 }
        roundPlayerCounter = 0
        rounds = []
        puxado = 'none'

        ShuffleDeck()
        chooseTrump()
        dealCards()
        intercalatePlayers()
        UpdateGame()
        broadCastMessage(JSON.stringify({ type: 'startGame', players: playerNicksStart }))
        break

      case 'play_card':
        console.log(`${nick} played ${data.card.value} - ${data.card.suit}`)

        currentRound = []
        players.map((player, player_index) => {
          if (player.nick === data.nick) {
            player.cards.map((card, index) => {

              if (card.suit === data.card.suit && card.value === data.card.value) {
                console.log('found')
                player.cards.splice(index, 1)
              }
            })

            player.played_card = data.card

            let next_player = player_index += 1
            if (next_player === players.length) {
              next_player = player_index = 0
            }
            player.turn = !player.turn
            players[next_player].turn = true
          }

          currentRound.push({ nick: player.nick, played_card: player.played_card, team: player.team })
        })

        if (roundPlayerCounter === 0) {
          puxado = data.card.suit
        }

        roundPlayerCounter += 1
        if (roundPlayerCounter === 4) {
          calculateScore()
          puxado = ''
          rounds.push(currentRound)
          currentRound = []

          players.map((player) => player.played_card = { suit: 'none', value: 'none' })
          players.map((player) => player.turn = false)

          let highest_player_round = {}
          players.map((player) => {
            if (highest.nick === player.nick) {
              highest_player_round = player
            }
          })
          broadCastMessage(JSON.stringify({ type: 'announceWinner', winner: highest }))


          if (rounds.length === 10) {

            const team1 = []
            const team2 = []

            players.map((player) => {
              if (player.team === 1) team1.push({ nick: player.nick })
              if (player.team === 2) team2.push({ nick: player.nick })
            })

            let winning_team_final = {
              winning_team: 0,
              teams: [
                { team: 1, members: team1, score: scores.team1 },
                { team: 2, members: team2, score: scores.team2 }
              ]
            }
            if (scores.team1 > scores.team2) {
              winning_team_final.winning_team = 1
            } else if (scores.team1 < scores.team2) {
              winning_team_final.winning_team = 2
            } else {
              winning_team_final.winning_team = 0
            }

            saveMatch(winning_team_final)

            broadCastMessage(JSON.stringify({ type: 'announceWinnerTeam', game_results: winning_team_final }))
          }
          ArrangePlayers(highest_player_round)
          players[0].turn = true
          UpdateGame()
          highest = {}
          roundPlayerCounter = 0
        }

        UpdateGame()
        break
    }
  })

  // when a client disconnects, remove them from the clients array
  ws.on('close', () => {
    console.log(`Client ${nick} disconnected`);

    players = players.filter(function (player) {
      return player.nick !== nick;
    });

    const playerNicks = getPlayerNicks()
    broadCastMessage(JSON.stringify({ type: 'updatePlayers', players: playerNicks }))
  });
});



const chooseTrump = () => {
  const randomNumber = Math.floor(Math.random() * 4);
  trump = suits[randomNumber]
}

const intercalatePlayers = () => {
  const team1 = []
  const team2 = []
  const intercalatedTeam = []

  players.map((player) => {
    if (player.team === 1) team1.push(player)
    if (player.team === 2) team2.push(player)
  })

  for (let i = 0; i < Math.max(team1.length, team2.length); i++) {
    if (i < team1.length) {
      intercalatedTeam.push(team1[i]);
    }
    if (i < team2.length) {
      intercalatedTeam.push(team2[i]);
    }
  }

  players = intercalatedTeam
}

const ArrangePlayers = (first_player) => {
  let fp_index = players.indexOf(first_player)
  let new_players_order = [first_player]

  for (let i = 0; i < players.length - 1; i++) {
    if (fp_index === players.length - 1) {
      fp_index = 0
    } else {
      fp_index += 1
    }
    new_players_order.push(players[fp_index])
  }

  players = new_players_order


}

const calculateScore = () => {
  currentRound.map((play, play_index) => {
    if (play_index === 0) {
      highest = play
    } else {
      if (play.played_card.suit === highest.played_card.suit) {
        const play_value = calculateValue(play.played_card.value)
        const highest_card_value = calculateValue(highest.played_card.value)
        if (play_value > highest_card_value) {
          highest = play
        }
      } else {
        if (play.played_card.suit === trump) {
          highest = play
        }
      }
    }
  })

  console.log(highest)

  const winning_team = highest.team
  const team_score = CountScore(currentRound)
  console.log(team_score)

  switch (winning_team) {
    case 1:
      scores.team1 += team_score
      break
    case 2:
      scores.team2 += team_score
      break
  }
}

const CountScore = (plays) => {
  let play_score = 0
  plays.map((play) => {
    const play_value = calculateValue(play.played_card.value)
    console.log(play_value)
    play_score += play_value
  })
  return play_score
}

const calculateValue = (value) => {
  let final_value = 0
  switch (value) {
    case '7':
      final_value = 10
      break
    case 'jack':
      final_value = 3
      break
    case 'queen':
      final_value = 2
      break
    case 'king':
      final_value = 4
      break
    case 'ace':
      final_value = 11
      break
  }

  return final_value
}

const UpdateGame = () => {
  for (let i = 0; i < players.length; i++) {
    const player = players[i];
    const other_players = []
    players.map(function (player_filter) {
      other_players.push({
        nick: player_filter.nick,
        turn: player_filter.turn,
        cards: player_filter.cards.length,
        played_card: player_filter.played_card,
        team: player_filter.team
      })
    })
    console.log(other_players)

    player.ws.send(JSON.stringify({ type: 'updateGame', nick: player.nick, cards: player.cards, players: other_players, turn: player.turn, played_card: player.played_card, rounds, puxado, scores, trump, team: player.team }))
  }
}

const broadCastMessage = (msg) => {
  players.forEach((player) => {
    player.ws.send(msg)
  })
}

const getPlayerNicks = () => {
  const playerNicks = players.map((player) => ({ player: player.nick, team: player.team, turn: player.turn }))
  console.log(playerNicks)
  return playerNicks
}

const dealCards = () => {

  const c1 = deck.slice(0, 10)
  const c2 = deck.slice(10, 20)
  const c3 = deck.slice(20, 30)
  const c4 = deck.slice(30, 40)
  const hand_array = [c1, c2, c3, c4]

  for (let i = 0; i < players.length; i++) {
    const player = players[i];
    player.cards = hand_array[i]
    player.ws.send(JSON.stringify({ type: 'dealCards', cards: hand_array[i] }))
  }
}

app.get('/', (req, res) => {
  return res.send('ok')
})

const saveMatch = (newMatch) => {
  let matches_array = []
  const data = fs.readFileSync('data.json', 'utf8');
  matches_array = JSON.parse(data)

  matches_array.push(newMatch)

  fs.writeFileSync('data.json', JSON.stringify(matches_array))

}

app.get('/past-matches', (req, res) => {
  const data = fs.readFileSync('data.json', 'utf8');
  return res.send(JSON.parse(data))
})

app.listen(5000, () => {
  console.log('WebServer listening on port 5000')
  console.log('WebSocket listening on port 5050')
})