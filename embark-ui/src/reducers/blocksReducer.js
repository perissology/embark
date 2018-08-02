import {RECEIVE_BLOCKS, RECEIVE_BLOCKS_ERROR} from "../actions";

export default function accounts(state = {}, action) {
  switch (action.type) {
    case RECEIVE_BLOCKS:
      return Object.assign({}, state, {data: action.blocks.data});
    case RECEIVE_BLOCKS_ERROR:
      return Object.assign({}, state, {error: true});
    default:
      return state;
  }
}