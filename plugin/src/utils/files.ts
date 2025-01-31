export const mergeContents = ({
  anchor,
  src,
  newSrc,
  comment,
  tag,
}: MergeContentsArgs) => {
  const commentStart = `${comment} @generated begin ${tag} - expo-nse-plugin`;
  const commentEnd = `${comment} @generated end ${tag}`;
  const newFragment = `${anchor}\n${commentStart}\n${newSrc}\n${commentEnd}\n`;
  return src.replace(anchor, newFragment);
};

type MergeContentsArgs = {
  anchor: string;
  src: string;
  newSrc: string;
  comment: string;
  tag: string;
};
