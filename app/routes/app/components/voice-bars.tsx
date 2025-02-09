const VoiceBars = () => {
  //const durations = [474, 345, 500, 322, 476, 312, 441, 289, 487, 346];
  const durations = [474, 433, 407, 458, 400, 427, 441, 419, 487, 442];
  return (
    <div className="flex items-center justify-center gap-2">
      {durations.map((duration, index) => (
        <div
          key={index}
          className="w-2 h-6 rounded-lg bg-slate-500 animate-sound"
          style={{ animationDuration: `${duration}ms` }}
        ></div>
      ))}
    </div>
  );
};

export default VoiceBars;
