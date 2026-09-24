const pieces = {
  stripePrefix: 'sk_test_',
  stripeBody: 'fakefixture7x9q2m4k6p8r',
  stripeMock: 'mockfixture7x9q2m4k6p8r',
  awsPrefix: 'AKIA',
  awsBody: 'FAKE2EXAMPLE7Q9Z',
  awsSecret: 'FAKEsecretExample7Q9Z4pL2mN8rT4vX6cD8wY0',
  dbUser: 'fake_user',
  dbPassword: 'fake_password_7Q9',
  dbHost: 'db.example.invalid',
  dbName: 'fake_database',
  emailLocal: 'fake.user',
  emailDomain: 'synthetic.example',
  ipv4: '10.20.30.40',
  clientName: 'Example Client Synthetic',
  clientMock: 'Entity_Z_fake7q9',
};

export const fakeStripeKey = () => `${pieces.stripePrefix}${pieces.stripeBody}`;
export const fakeStripeMock = () => `${pieces.stripePrefix}${pieces.stripeMock}`;
export const fakeAwsKeyId = () => `${pieces.awsPrefix}${pieces.awsBody}`;
export const fakeAwsSecretKey = () => pieces.awsSecret;
export const fakeGitHubToken = () => `ghp_${'FakeGitHubToken0123456789abcdefXYZ12'}`;
export const fakeFineGrainedToken = () => `github_pat_${'FakeFineGrainedToken0123456789ABCDE'}`;
export const fakeOpenAIKey = () => `sk-proj-${'FakeOpenAIProject0123456789ABCDE'}`;
export const fakeAnthropicKey = () => `sk-ant-api03-${'FakeAnthropicKey0123456789ABCDE'}`;
export const fakeGoogleKey = () => `AIza${'FakeGoogleKey0123456789ABCDEFGHIJKL'}`;
export const fakeSlackToken = () => 'xoxb-FAKE-SLACK-TOKEN-0123456789';
export const fakeJwt = () =>
  [
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',
    'eyJzdWIiOiJmYWtlLXVzZXIiLCJyb2xlIjoiZmFrZSJ9',
    'RkFLRVNJR05BVEVSRUdVVUkU',
  ].join('.');
export const fakePem = () =>
  [
    '-----BEGIN PRIVATE KEY-----',
    'RkFLRVBFTElOVEVTVEVGVFVSRUZBS0U=',
    'RkFLRVNFQ1JFVFRFVSRUZBS0U=',
    '-----END PRIVATE KEY-----',
  ].join('\n');
export const fakeGenericSecret = () => 'FAKE_SECRET_7Q9Z4P2L';
export const fakeInternalHost = () => 'service.internal';
export const fakeDbUrl = () =>
  `postgres://${pieces.dbUser}:${pieces.dbPassword}@${pieces.dbHost}:5432/${pieces.dbName}`;
export const fakeDbMock = () =>
  `postgres://user_fake7q:MockPass7Q9@host-fixture.mock.internal:5432/db_fake7q`;
export const fakeEmail = () => `${pieces.emailLocal}@${pieces.emailDomain}`;
export const fakeIpv4 = () => pieces.ipv4;
export const fakeClientName = () => pieces.clientName;
export const fakeClientMock = () => pieces.clientMock;

export const fakeFixtureValues = Object.freeze({
  stripeKey: fakeStripeKey(),
  stripeMock: fakeStripeMock(),
  awsKeyId: fakeAwsKeyId(),
  awsSecretKey: fakeAwsSecretKey(),
  dbUrl: fakeDbUrl(),
  dbMock: fakeDbMock(),
  email: fakeEmail(),
  ipv4: fakeIpv4(),
  clientName: fakeClientName(),
  clientMock: fakeClientMock(),
});
