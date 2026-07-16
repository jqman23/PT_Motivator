import assert from 'node:assert/strict';
import test from 'node:test';
// @ts-expect-error Node's type-stripping test runner requires the explicit extension.
import { isAgentRequest, isBulkNoteAgentRequest, isDoctorNoteResponseCommand, isExerciseCompletionCoverageRequest, isExistingPhotoInspectionRequest, isHistoryCorrectionFollowUp, isHistoryScopeFollowUp, isHistorySummaryRequest, isSemanticTextAggregateRequest, isVisualizationRequest, isWholeHistoryComparisonRequest, prefersChronologicalHistoryAnswer } from './aiRequestIntent.ts';

test('recognizes natural app commands and short follow-ups', () => {
  for (const request of [
    'Log that I completed calf raises today',
    'Record pain as 4 for today',
    'Save this in my general note',
    'Turn off the daily summary widget',
    'Take me to my doctor notes',
    'I completed my balance exercise',
    'Yes, do that',
    'My pain is 4 today',
    'I slept 7.5 hours',
    'Ask my doctor about the swelling',
    'PT session tomorrow',
    '2 sets of 10 reps on calf raises',
    'On [today], mark [prone McKenzie] complete and log [1] set of [12]',
    'I want you to rename my Mobility category',
    'Could you please draft removing tomorrow’s PT session?',
    'I want the timer gone please',
    'No daily summary on the home screen anymore.',
    'Call the app Recovery Board',
    'The app title should be Recovery Board',
    'There should be a PT session tomorrow',
    'Get rid of my training appointment on Friday',
    'Prone McKenzie is done today — 1 x 12, note test',
    'the doc note about emg answer it by saying ill do a follow up',
    'im asking you to respond to Nerve issues/EMG doc note',
    'I am asking you for an answer to the Nerve issues/EMG doctor question',
    'i dont know what that means just create the note',
  ]) assert.equal(isAgentRequest(request), true, request);
});

test('keeps doctor-note responses out of bulk note-history routing', () => {
  const response = "Respond to the Nerve issues/EMG doc note by saying I'll do a follow up.";
  assert.equal(isDoctorNoteResponseCommand(response), true);
  assert.equal(isAgentRequest(response), true);
  assert.equal(isBulkNoteAgentRequest(response), false);
  assert.equal(isBulkNoteAgentRequest('Whenever my general notes mention walked, mark Walk complete across those days.'), true);
});

test('keeps visual-only requests conversational while preserving a separate write clause', () => {
  assert.equal(isAgentRequest('Create a chart of my exercise activity'), false);
  assert.equal(isAgentRequest('Chart my exercise activity, then add a note to the three worst days'), true);
  assert.equal(isAgentRequest('Add a note to today and also chart the past week'), true);
});

test('does not turn advice or capability questions into commands', () => {
  for (const request of [
    'Should I add another calf exercise?',
    'How can I record pain more consistently?',
    'What can you change in the app?',
    'Do you recommend turning off reminders?',
    'What should I name the app?',
    'What would happen without the timer?',
    'Make me a graph of every recorded exercise.',
    'Create a table using my complete history.',
    'Can you see anything about the image?',
    'I already attached the photo to general notes for today. Look at it.',
    "I don't want to upload the picture again.",
    'I am a little worried about the bruise that is painful but yet to show visually after my bike crash',
    'Can you help me remain positive today?',
    'What are your recommendations for treatment given what I have put for today?',
    '10 hours later there is still no bruising, but it hurts when I load my leg or put pressure on it',
    'Why would you ask me for the ID of a doctor note?',
    'I am asking for your advice',
    'I put ice on it and the pain changed when I loaded the leg',
  ]) assert.equal(isAgentRequest(request), false, request);
});

test('requires an app-directed mutation rather than a coincidental physical-world verb', () => {
  for (const request of [
    "Put this symptom update in today's general note",
    'Add this advice to my doctor note',
    'Please record that loading my leg hurts',
    'Could you save this in my health log?',
  ]) assert.equal(isAgentRequest(request), true, request);
});

test('recognizes existing attached-photo inspection separately from attachment commands', () => {
  assert.equal(isExistingPhotoInspectionRequest('Can you see anything about the image?'), true);
  assert.equal(isExistingPhotoInspectionRequest('I already attached it to general notes for today. look at it.'), true);
  assert.equal(isExistingPhotoInspectionRequest("I don't want to upload the picture again."), true);
  assert.equal(isExistingPhotoInspectionRequest('Can I send you an image you can attach to my general notes?'), false);
  assert.equal(isAgentRequest('Can I send you an image you can attach to my general notes?'), true);
});

test('does not turn explicit no-change corrections into commands', () => {
  for (const request of [
    "Don't update anything—why can't you see my exercises?",
    'Do not change the records; check again.',
    "I'm not asking you to save anything, just answer me.",
  ]) assert.equal(isAgentRequest(request), false, request);
});

test('recognizes completion coverage, correction follow-ups, and visualization requests', () => {
  assert.equal(isExerciseCompletionCoverageRequest('What exercises did I not do at all the past 5 days?'), true);
  assert.equal(isExerciseCompletionCoverageRequest('Which stretches have I never completed this week?'), true);
  assert.equal(isExerciseCompletionCoverageRequest('What exercises did I do?'), false);
  assert.equal(isHistoryCorrectionFollowUp('Look harder'), true);
  assert.equal(isHistoryCorrectionFollowUp("That’s not true, I did plenty of exercises"), true);
  assert.equal(isVisualizationRequest('Visualize my past five days in a table'), true);
  assert.equal(isVisualizationRequest('Show this in a visual'), true);
  assert.equal(isSemanticTextAggregateRequest('Give me a count of how much I talk about each symptom'), true);
  assert.equal(isSemanticTextAggregateRequest('How often have I mentioned each symptom?'), true);
  assert.equal(isSemanticTextAggregateRequest('Log 3 sets of calf raises'), false);
});

test('only carries an earlier date window into a genuine follow-up', () => {
  assert.equal(isHistoryScopeFollowUp('Visualize that as a table'), true);
  assert.equal(isHistoryScopeFollowUp('What about energy?'), true);
  assert.equal(isHistoryScopeFollowUp("That's not true—look harder"), true);
  assert.equal(isHistoryScopeFollowUp('What was my worst day ever?'), false);
  assert.equal(isHistoryScopeFollowUp('When did I first mention heel pain?'), false);
  assert.equal(isHistoryScopeFollowUp('What was my average pain over the past 7 days, and how does it compare with the 7 days immediately before that?'), false);
});

test('recognizes requests that require comparison across the whole loaded history', () => {
  for (const request of [
    'Look at all sessions. Tell me about my best day.',
    'Which was my worst session overall?',
    'Review everything I have logged.',
    'Use my complete history to answer this.',
    'Analyze my records from the very beginning.',
    'Take every single logged day into account.',
    'Compare them all and tell me what stands out.',
    'Since I started tracking, when was I doing best?',
    'Do not just use the recent days; consider everything.',
    'What was my best day of all time?',
    'Scan each check-in before answering.',
    'Base this on all available saved data.',
    'Visualize patterns across all exercises.',
    'Graph every metric I have recorded.',
    'Plot the complete recovery picture.',
    'Chart everything and show me the trend.',
    'Make a table summarizing each category.',
    'Create a chart of all recorded activity.',
    'Give me the frequency with which I talk about each symptom.',
    'Count how much I mention each body part.',
  ]) assert.equal(isWholeHistoryComparisonRequest(request), true, request);
});

test('recognizes broad history summary prompts so failure recovery can summarize the window', () => {
  for (const request of [
    'What stood out to you this past week?',
    'What caught your attention this week?',
    'Give me an overview of the last few days.',
    'Summarize what changed over the week.',
    'What are the main takeaways from this week?',
  ]) assert.equal(isHistorySummaryRequest(request), true, request);

  for (const request of [
    'When did I first mention heel pain?',
    'Find the first day I mentioned stairs.',
    'Take me to my doctor notes.',
  ]) assert.equal(isHistorySummaryRequest(request), false, request);
});

test('keeps bounded and targeted history questions on retrieval instead of whole-history comparison', () => {
  for (const request of [
    'When did I mention heel burning?',
    'Compare my last seven days.',
    'What happened yesterday?',
    'Find the first day I mentioned stairs.',
    'Summarize this PT session.',
    'Visualize only the most recent entries.',
    "Don't graph all of it—just use recent data.",
    'Show me all exercises in my library.',
    'Mark Prone McKenzie complete and log 1 set of 12 reps.',
    'When have I complained about my left foot? Summarize the main episodes and hyperlink every date you discuss.',
  ]) assert.equal(isWholeHistoryComparisonRequest(request), false, request);
});

test('detects episode-style history answers that should be chronological', () => {
  assert.equal(prefersChronologicalHistoryAnswer('When have I complained about my left foot? Summarize the main episodes.'), true);
  assert.equal(prefersChronologicalHistoryAnswer('Show the recent times I complained about my left foot.'), false);
});
