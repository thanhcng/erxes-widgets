import EJSON from 'meteor-ejson';
import gql from 'graphql-tag';
import { SENDING_ATTACHMENT, ATTACHMENT_SENT } from '../constants';
import { call, connection } from '../../erxes';
import client from '../../apollo-client';
import uploadHandler from '../../uploadHandler';
import { changeConversation } from './messenger';

export const readMessages = conversationId =>
  // mark as read
  () => client.mutate({
    mutation: gql`
      mutation readConversationMessages($conversationId: String) {
        readConversationMessages(conversationId: $conversationId)
      }`,

    variables: {
      conversationId,
    },
  });

export const sendMessage = (message, attachments) =>
  (dispatch, getState) => {
    const state = getState();

    // current conversation
    const currentConversationId = state.activeConversation;

    client.mutate({
      mutation: gql`
        mutation insertMessage($brandCode: String!, $email: String!, $message: String,
            $conversationId: String!, $attachments: [AttachmentInput]) {

          insertMessage(brandCode: $brandCode, email: $email, message: $message,
            conversationId: $conversationId, attachments: $attachments) {
            _id
            conversationId
          }
        }`,

      variables: {
        brandCode: connection.data.brand_id,
        email: connection.data.email,
        conversationId: currentConversationId,
        message,
        attachments,
      },
    })

    // after mutation
    .then(({ data }) => {
      // if there is no current conversation new conversation will be created
      if (!currentConversationId) {
        dispatch(changeConversation(data.insertMessage.conversationId));
      }
    });
  };

export const sendFile = file =>
  (dispatch, getState) => {
    uploadHandler({
      file,
      uploadAction: ({ data, fileInfo }) => {
        dispatch({ type: SENDING_ATTACHMENT });

        // file object
        const doc = {
          name: file.name,
          data: EJSON.toJSONValue(data),
        };

        call('sendFile', doc).then(response => {
          dispatch({ type: ATTACHMENT_SENT });

          const attachment = Object.assign({ url: response.url }, fileInfo);

          // send message with attachment
          // QUESTION: Do we need to make 2 calls to send a message with attachment?
          sendMessage('This message has an attachment', [attachment])(dispatch, getState);
        });
      },
    });
  };