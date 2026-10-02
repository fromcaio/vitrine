export const generateStaticParams = async () => [];
export default async function SpaceHome({ params }) {
  const { handle } = await params;
  return <p>[[home:{handle}:{Date.now()}]]</p>;
}
