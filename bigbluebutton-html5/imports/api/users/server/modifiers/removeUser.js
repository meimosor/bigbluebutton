import { check } from 'meteor/check';
import Users from '/imports/api/users';
import VideoStreams from '/imports/api/video-streams';
import Logger from '/imports/startup/server/logger';
import ClientConnections from '/imports/startup/server/ClientConnections';
import userEjected from '/imports/api/users/server/modifiers/userEjected';

const disconnectUser = (meetingId, userId) => {
  const sessionUserId = `${meetingId}--${userId}`;
  ClientConnections.removeClientConnection(sessionUserId);

  const serverSessions = Meteor.server.sessions;
  const interable = serverSessions.values();

  for (const session of interable) {
    if (session.userId === sessionUserId) {
      Logger.info(`Removed session id=${userId} meeting=${meetingId}`);
      session.close();
    }
  }
};

export default async function removeUser(body, meetingId) {
  const { intId: userId, reasonCode } = body;
  check(meetingId, String);
  check(userId, String);

  try {
    const selector = {
      meetingId,
      userId,
    };

    // we don't want to fully process the redis message in frontend
    // since the backend is supposed to update Mongo
    if ((process.env.BBB_HTML5_ROLE !== 'frontend')) {
      if (body.eject) {
        await userEjected(meetingId, userId, reasonCode);
      }

      await VideoStreams.removeAsync({ meetingId, userId });

      await Users.removeAsync(selector);
    }

    if (!process.env.BBB_HTML5_ROLE || process.env.BBB_HTML5_ROLE === 'frontend') {
      // Wait for user removal and then kill user connections and sessions
      const queryCurrentUser = Users.find(selector);
      const countUser = await queryCurrentUser.countAsync();
      if (countUser === 0) {
        disconnectUser(meetingId, userId);
      } else {
        const queryUserObserver = queryCurrentUser.observeChanges({
          removed() {
            disconnectUser(meetingId, userId);
            queryUserObserver.stop();
          },
        });
      }
    }

    Logger.info(`Removed user id=${userId} meeting=${meetingId}`);
  } catch (err) {
    Logger.error(`Removing user from Users collection: ${err}`);
  }
}
